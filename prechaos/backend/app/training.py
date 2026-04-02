from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import torch
from openpyxl import load_workbook
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from .config import FEATURE_NAMES, LIVE_TRAINING_META_PATH, SCALER_PATH, TRAINED_MODEL_PATH, WINDOW_SIZE
from .model import PreChaosTransformer


@dataclass
class TrainingArtifacts:
    model_path: str
    scaler_path: str
    metrics: dict


def _load_dataset(dataset_path: Path) -> list[dict]:
    if dataset_path.suffix.lower() == ".json":
        return json.loads(dataset_path.read_text(encoding="utf-8"))
    if dataset_path.suffix.lower() == ".jsonl":
        records: list[dict] = []
        for line in dataset_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                records.append(json.loads(line))
        return records
    if dataset_path.suffix.lower() in {".xlsx", ".xlsm"}:
        workbook = load_workbook(dataset_path, read_only=True, data_only=True)
        sheet = workbook[workbook.sheetnames[0]]
        rows = sheet.iter_rows(values_only=True)
        header = [str(value) for value in next(rows)]
        records: list[dict] = []
        for row in rows:
            if row and row[0]:
                records.append({header[index]: row[index] for index in range(len(header))})
        return records
    raise ValueError("Supported dataset formats are JSON and XLSX.")


def _engineer_features(row: dict) -> np.ndarray:
    if "features" in row and row["features"] is not None:
        return np.asarray(row["features"], dtype=np.float32)
    if "subject" in row:
        hold_values = np.array(
            [float(value) for key, value in row.items() if str(key).startswith("H.") and value is not None],
            dtype=np.float32,
        )
        dd_values = np.array(
            [float(value) for key, value in row.items() if str(key).startswith("DD.") and value is not None],
            dtype=np.float32,
        )
        ud_values = np.array(
            [float(value) for key, value in row.items() if str(key).startswith("UD.") and value is not None],
            dtype=np.float32,
        )
        hold_mean = float(np.mean(hold_values)) if hold_values.size else 0.12
        dd_mean = float(np.mean(dd_values)) if dd_values.size else 0.18
        ud_mean = float(np.mean(ud_values)) if ud_values.size else 0.09
        typing_speed = 1.0 / max(hold_mean, 1e-4)
        pause_time = max(dd_mean, ud_mean)
        variation = float(np.std(np.concatenate([hold_values, dd_values, ud_values]))) if (
            hold_values.size or dd_values.size or ud_values.size
        ) else 0.0
        error_score = float(np.mean(np.abs(dd_values - ud_values[: dd_values.size]))) if (
            dd_values.size and ud_values.size
        ) else 0.0
        idle_time = max(float(row.get("sessionIndex", 1)) - 1.0, 0.0) * 0.15
        mouse_speed = 0.0
        tab_switch = max(float(row.get("rep", 1)) - 1.0, 0.0) / 50.0
        session_duration = float(row.get("rep", 1)) / 5.0
        fatigue_score = float(np.clip(variation / max(hold_mean, 1e-4), 0.0, 1.0))
        return np.array(
            [
                typing_speed,
                pause_time,
                variation,
                error_score,
                idle_time,
                mouse_speed,
                tab_switch,
                session_duration,
                fatigue_score,
            ],
            dtype=np.float32,
        )

    hold = float(row.get("hold_time", row.get("typing_speed", 150.0)))
    dd = float(row.get("dd_latency", row.get("pause_time", 80.0)))
    ud = float(row.get("ud_latency", row.get("variation", 60.0)))
    deviation = float(row.get("deviation", abs(dd - ud)))
    idle_time = float(row.get("idle_time", 0.0))
    mouse_speed = float(row.get("mouse_movement_speed", 0.0))
    tab_switch = float(row.get("tab_switch_frequency", 0.0))
    session_duration = float(row.get("session_duration", 0.0))
    fatigue_score = float(row.get("fatigue_score", 0.0))
    typing_speed = 1000.0 / max(hold, 1.0)
    pause_time = max(dd, ud) / 1000.0
    variation = np.std([hold, dd, ud]) / 1000.0
    error_score = deviation / max(np.mean([hold, dd, ud]), 1.0)
    return np.array(
        [
            typing_speed,
            pause_time,
            variation,
            error_score,
            idle_time,
            mouse_speed,
            tab_switch,
            session_duration,
            fatigue_score,
        ],
        dtype=np.float32,
    )


def _group_sequences(records: Iterable[dict]) -> tuple[np.ndarray, np.ndarray]:
    by_subject: dict[str, list[np.ndarray]] = {}
    by_session: dict[str, list[np.ndarray]] = {}
    for record in records:
        subject_id = str(record.get("user_id", record.get("subject", "unknown")))
        session_id = str(record.get("session_id", record.get("sessionIndex", "0")))
        features = _engineer_features(record)
        by_subject.setdefault(subject_id, []).append(features)
        by_session.setdefault(f"{subject_id}:{session_id}", []).append(features)

    sequences: list[np.ndarray] = []
    labels: list[int] = []
    for session_key, samples in by_session.items():
        if len(samples) < WINDOW_SIZE:
            continue
        matrix = np.stack(samples)
        subject_id = session_key.split(":", 1)[0]
        subject_baseline = np.stack(by_subject[subject_id]).mean(axis=0)
        window_scores: list[float] = []
        windows: list[np.ndarray] = []
        for start in range(0, len(matrix) - WINDOW_SIZE + 1):
            window = matrix[start : start + WINDOW_SIZE]
            instability = float(np.mean(np.linalg.norm(window - subject_baseline, axis=1)))
            windows.append(window)
            window_scores.append(instability)
        if not window_scores:
            continue
        threshold = float(np.quantile(window_scores, 0.65))
        for window, instability in zip(windows, window_scores):
            sequences.append(window)
            labels.append(1 if instability >= threshold else 0)
    if not sequences:
        raise ValueError("Dataset did not produce any valid sequences of length 30.")
    return np.stack(sequences), np.asarray(labels, dtype=np.float32)


def train_from_dataset(
    dataset_file: str,
    epochs: int = 24,
    batch_size: int = 32,
    learning_rate: float = 1e-3,
) -> TrainingArtifacts:
    dataset_path = Path(dataset_file).expanduser().resolve()
    records = _load_dataset(dataset_path)
    sequences, labels = _group_sequences(records)
    scaler = StandardScaler()
    flattened = sequences.reshape(-1, len(FEATURE_NAMES))
    scaled = scaler.fit_transform(flattened).reshape(-1, WINDOW_SIZE, len(FEATURE_NAMES))
    X_train, X_val, y_train, y_val = train_test_split(
        scaled, labels, test_size=0.2, random_state=42, stratify=labels
    )

    train_loader = DataLoader(
        TensorDataset(torch.tensor(X_train, dtype=torch.float32), torch.tensor(y_train, dtype=torch.float32)),
        batch_size=batch_size,
        shuffle=True,
    )
    val_X = torch.tensor(X_val, dtype=torch.float32)
    val_y = torch.tensor(y_val, dtype=torch.float32)

    model = PreChaosTransformer(feature_dim=len(FEATURE_NAMES))
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    for _ in range(epochs):
        model.train()
        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            logits, _ = model(batch_X)
            loss = criterion(logits, batch_y)
            loss.backward()
            optimizer.step()

    model.eval()
    with torch.no_grad():
        logits, _ = model(val_X)
        probs = torch.sigmoid(logits).numpy()
    preds = (probs >= 0.5).astype(np.float32)
    metrics = {
        "accuracy": round(float(accuracy_score(y_val, preds)), 4),
        "precision": round(float(precision_score(y_val, preds, zero_division=0)), 4),
        "recall": round(float(recall_score(y_val, preds, zero_division=0)), 4),
        "f1": round(float(f1_score(y_val, preds, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_val, preds).tolist(),
        "train_samples": int(len(X_train)),
        "validation_samples": int(len(X_val)),
    }

    TRAINED_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), TRAINED_MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    LIVE_TRAINING_META_PATH.parent.mkdir(parents=True, exist_ok=True)
    LIVE_TRAINING_META_PATH.write_text(
        json.dumps(
            {
                "last_trained_at": str(np.datetime64("now")),
                "metrics": metrics,
                "dataset_path": str(dataset_path),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    return TrainingArtifacts(
        model_path=str(TRAINED_MODEL_PATH),
        scaler_path=str(SCALER_PATH),
        metrics=metrics,
    )
