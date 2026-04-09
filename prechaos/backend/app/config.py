from __future__ import annotations

from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent
BACKEND_ROOT = APP_ROOT.parent
DATA_ROOT = BACKEND_ROOT / "data"
MODEL_ROOT = BACKEND_ROOT / "models"
FEEDBACK_PATH = DATA_ROOT / "feedback.json"
BASELINE_PATH = DATA_ROOT / "baseline.json"
LIVE_DATA_PATH = DATA_ROOT / "live_samples.jsonl"
LIVE_EVENT_PATH = DATA_ROOT / "live_events.jsonl"
PREDICTION_LOG_PATH = DATA_ROOT / "prediction_log.jsonl"
LIVE_TRAINING_META_PATH = DATA_ROOT / "live_training_meta.json"
TRAINED_MODEL_PATH = MODEL_ROOT / "prechaos_model.joblib"
SCALER_PATH = MODEL_ROOT / "scaler.pkl"
MODEL_MANIFEST_PATH = MODEL_ROOT / "artifact_manifest.json"
SECURITY_LOG_PATH = DATA_ROOT / "security.log"
API_KEY_PATH = DATA_ROOT / "api_key.txt"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
MAX_REQUEST_BYTES = 256 * 1024
MAX_DATASET_PATH_LENGTH = 260
API_KEY_ENV_NAME = "PRECHAOS_API_KEY"
API_KEY_HEADER_NAME = "X-PreChaos-API-Key"
WINDOW_SIZE = 30
FEATURE_BUCKET_MS = 2_000
EVENT_WINDOW_MS = WINDOW_SIZE * FEATURE_BUCKET_MS
FEATURE_NAMES = [
    "typing_speed",
    "pause_time",
    "variation",
    "error_score",
    "idle_time",
    "mouse_movement_speed",
    "tab_switch_frequency",
    "session_duration",
    "fatigue_score",
]

# Security guardrails for sanitized backend-owned feature vectors.
FEATURE_LIMITS = {
    "typing_speed": (0.0, 25.0),
    "pause_time": (0.0, 10.0),
    "variation": (0.0, 10.0),
    "error_score": (0.0, 1.0),
    "idle_time": (0.0, 60.0),
    "mouse_movement_speed": (0.0, 50.0),
    "tab_switch_frequency": (0.0, 10.0),
    "session_duration": (0.0, 24 * 60.0),
    "fatigue_score": (0.0, 1.0),
}

ALLOWED_DATASET_SUFFIXES = {".json", ".jsonl", ".xlsx", ".xlsm"}
