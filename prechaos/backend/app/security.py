from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

import joblib

from .config import API_KEY_ENV_NAME, API_KEY_PATH, DATA_ROOT, MODEL_MANIFEST_PATH, MODEL_ROOT, SECURITY_LOG_PATH


class SecurityViolationError(RuntimeError):
    """Raised when a protected file or model artifact fails integrity checks."""


def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _validate_managed_path(path: Path, expected_root: Path) -> None:
    expected_root = expected_root.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.parent.resolve() != expected_root:
        raise SecurityViolationError(f"Refusing to write outside managed directory: {expected_root}")
    if path.exists() and path.is_symlink():
        raise SecurityViolationError(f"Refusing to write through symlinked path: {path.name}")


def get_security_logger() -> logging.Logger:
    logger = logging.getLogger("prechaos.security")
    if logger.handlers:
        return logger

    _ensure_dir(SECURITY_LOG_PATH)
    handler = RotatingFileHandler(SECURITY_LOG_PATH, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    return logger


def log_suspicious_activity(event: str, **details: Any) -> None:
    redacted = {
        key: value
        for key, value in details.items()
        if key not in {"authorization", "api_key", "token", "body", "input", "headers"}
    }
    get_security_logger().warning("%s %s", event, json.dumps(redacted, default=str, ensure_ascii=True))


def safe_write_text(path: Path, content: str, *, managed_root: Path) -> None:
    _validate_managed_path(path, managed_root)
    temp_path = path.with_suffix(f"{path.suffix}.{secrets.token_hex(8)}.tmp")
    try:
        temp_path.write_text(content, encoding="utf-8")
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def safe_joblib_dump(value: Any, path: Path, *, managed_root: Path) -> None:
    _validate_managed_path(path, managed_root)
    temp_path = path.with_suffix(f"{path.suffix}.{secrets.token_hex(8)}.tmp")
    try:
        joblib.dump(value, temp_path)
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def safe_append_jsonl(path: Path, payload: dict[str, Any], *, managed_root: Path) -> None:
    _validate_managed_path(path, managed_root)
    line = (json.dumps(payload, ensure_ascii=True) + "\n").encode("utf-8")
    with path.open("ab") as handle:
        handle.write(line)
        handle.flush()
        os.fsync(handle.fileno())


def compute_file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_artifact_manifest(*, model_path: Path, scaler_path: Path, metadata: dict[str, Any]) -> dict[str, Any]:
    manifest = {
        "version": 1,
        "model_file": model_path.name,
        "model_sha256": compute_file_sha256(model_path),
        "scaler_file": scaler_path.name,
        "scaler_sha256": compute_file_sha256(scaler_path),
        **metadata,
    }
    safe_write_text(MODEL_MANIFEST_PATH, json.dumps(manifest, indent=2), managed_root=MODEL_ROOT)
    return manifest


def validate_artifact_manifest(*, model_path: Path, scaler_path: Path) -> dict[str, Any]:
    if not MODEL_MANIFEST_PATH.exists():
        raise SecurityViolationError("Model manifest is missing.")

    manifest = json.loads(MODEL_MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("model_file") != model_path.name or manifest.get("scaler_file") != scaler_path.name:
        raise SecurityViolationError("Artifact manifest points to unexpected files.")
    if manifest.get("model_sha256") != compute_file_sha256(model_path):
        raise SecurityViolationError("Model artifact checksum mismatch.")
    if manifest.get("scaler_sha256") != compute_file_sha256(scaler_path):
        raise SecurityViolationError("Scaler artifact checksum mismatch.")
    return manifest


def get_expected_api_key() -> str:
    from_env = os.environ.get(API_KEY_ENV_NAME, "").strip()
    if from_env:
        return from_env

    if API_KEY_PATH.exists():
        return API_KEY_PATH.read_text(encoding="utf-8").strip()

    token = secrets.token_urlsafe(32)
    safe_write_text(API_KEY_PATH, token, managed_root=DATA_ROOT)
    return token


def is_authorized_token(token: str | None) -> bool:
    expected = get_expected_api_key()
    return bool(token) and secrets.compare_digest(token, expected)
