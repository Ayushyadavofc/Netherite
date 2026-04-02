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
LIVE_TRAINING_META_PATH = DATA_ROOT / "live_training_meta.json"
TRAINED_MODEL_PATH = MODEL_ROOT / "prechaos_model.pt"
SCALER_PATH = MODEL_ROOT / "scaler.pkl"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
WINDOW_SIZE = 30
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
