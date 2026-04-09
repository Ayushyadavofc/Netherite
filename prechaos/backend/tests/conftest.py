"""Shared test fixtures for PreChaos backend tests."""
from __future__ import annotations

import json
import os
import sys
import threading
from pathlib import Path
from typing import Any, Generator
from unittest.mock import patch

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import (
    ALLOWED_DATASET_SUFFIXES,
    API_KEY_HEADER_NAME,
    FEATURE_NAMES,
)
from app.server import app


@pytest.fixture
def temp_data_root(tmp_path: Path) -> Path:
    """Create temporary data root directory."""
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


@pytest.fixture
def temp_model_root(tmp_path: Path) -> Path:
    """Create temporary model root directory."""
    model_dir = tmp_path / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    return model_dir


@pytest.fixture
def isolated_config(temp_data_root: Path, temp_model_root: Path, monkeypatch):
    """Redirect all config paths to temporary directories."""
    backend_root = temp_data_root.parent

    monkeypatch.setattr("app.config.DATA_ROOT", temp_data_root)
    monkeypatch.setattr("app.config.MODEL_ROOT", temp_model_root)
    monkeypatch.setattr("app.config.BACKEND_ROOT", backend_root)
    monkeypatch.setattr("app.config.FEEDBACK_PATH", temp_data_root / "feedback.json")
    monkeypatch.setattr("app.config.BASELINE_PATH", temp_data_root / "baseline.json")
    monkeypatch.setattr("app.config.LIVE_DATA_PATH", temp_data_root / "live_samples.jsonl")
    monkeypatch.setattr("app.config.LIVE_EVENT_PATH", temp_data_root / "live_events.jsonl")
    monkeypatch.setattr("app.config.PREDICTION_LOG_PATH", temp_data_root / "prediction_log.jsonl")
    monkeypatch.setattr("app.config.LIVE_TRAINING_META_PATH", temp_data_root / "live_training_meta.json")
    monkeypatch.setattr("app.config.TRAINED_MODEL_PATH", temp_model_root / "prechaos_model.joblib")
    monkeypatch.setattr("app.config.SCALER_PATH", temp_model_root / "scaler.pkl")
    monkeypatch.setattr("app.config.MODEL_MANIFEST_PATH", temp_model_root / "artifact_manifest.json")
    monkeypatch.setattr("app.config.SECURITY_LOG_PATH", temp_data_root / "security.log")
    monkeypatch.setattr("app.config.API_KEY_PATH", temp_data_root / "api_key.txt")

    # Create API key for tests
    api_key_path = temp_data_root / "api_key.txt"
    api_key_path.write_text("test-api-key-12345")
    monkeypatch.setenv("PRECHAOS_API_KEY", "test-api-key-12345")

    return temp_data_root


@pytest.fixture
def synthetic_model(temp_model_root: Path) -> tuple[LogisticRegression, StandardScaler]:
    """Create a lightweight synthetic model for testing."""
    np.random.seed(42)
    n_features = len(FEATURE_NAMES)

    # Generate synthetic training data
    X_train = np.random.randn(200, n_features)
    y_train = (X_train[:, 0] + X_train[:, 1] > 0).astype(int)

    # Train a simple model
    model = LogisticRegression(max_iter=1000, solver="liblinear", random_state=42)
    model.fit(X_train, y_train)

    # Create and save scaler
    scaler = StandardScaler()
    scaler.fit(X_train)

    model_path = temp_model_root / "prechaos_model.joblib"
    scaler_path = temp_model_root / "scaler.pkl"

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    return model, scaler


@pytest.fixture
def test_client(isolated_config) -> TestClient:
    """Create FastAPI test client with isolated config."""
    return TestClient(app)


@pytest.fixture
def auth_headers(isolated_config) -> dict[str, str]:
    """Return valid authentication headers."""
    return {API_KEY_HEADER_NAME: "test-api-key-12345"}


@pytest.fixture
def valid_event_batch() -> list[dict[str, Any]]:
    """Return a valid batch of events for testing."""
    base_time = 1700000000000
    return [
        {"timestamp": base_time, "type": "focus", "route": "/notes"},
        {"timestamp": base_time + 100, "type": "key_down", "key_class": "character", "route": "/notes"},
        {"timestamp": base_time + 200, "type": "key_down", "key_class": "character", "route": "/notes"},
        {"timestamp": base_time + 300, "type": "key_down", "key_class": "backspace", "route": "/notes"},
        {"timestamp": base_time + 500, "type": "mouse_move", "dx": 10.5, "dy": -5.2, "route": "/notes"},
        {"timestamp": base_time + 1000, "type": "route_change", "route": "/flashcards"},
        {"timestamp": base_time + 2000, "type": "scroll", "route": "/flashcards"},
        {"timestamp": base_time + 3000, "type": "visibility_change", "hidden": False, "route": "/flashcards"},
    ]


@pytest.fixture
def valid_collect_payload(valid_event_batch) -> dict[str, Any]:
    """Return valid payload for /collect endpoint."""
    return {
        "user_id": "test-user-123",
        "session_id": "test-session-456",
        "session_started_at": 1700000000000,
        "events": valid_event_batch,
        "write_to_dataset": True,
        "predict": True,
        "request_id": "test-request-789",
    }


@pytest.fixture
def valid_predict_payload(valid_event_batch) -> dict[str, Any]:
    """Return valid payload for /predict endpoint."""
    return {
        "user_id": "test-user-123",
        "session_id": "test-session-456",
        "session_started_at": 1700000000000,
        "events": valid_event_batch,
        "context": {
            "route": "/notes",
            "page_name": "notes",
            "productive_context": True,
            "focused_editable": True,
            "recent_meaningful_actions": 5.0,
        },
    }


@pytest.fixture
def valid_feedback_payload() -> dict[str, Any]:
    """Return valid payload for /feedback endpoint."""
    return {
        "user_id": "test-user-123",
        "label": "focused",
        "risk": 0.25,
    }


@pytest.fixture
def valid_baseline_payload(valid_event_batch) -> dict[str, Any]:
    """Return valid payload for /baseline endpoint."""
    return {
        "user_id": "test-user-123",
        "session_id": "test-session-456",
        "session_started_at": 1700000000000,
        "events": valid_event_batch[:3],
    }
