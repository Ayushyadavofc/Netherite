from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Sequence

from .config import DATA_ROOT
from .feature_engineering import NormalizedEvent, event_to_dict, validate_feature_vector
from .security import safe_append_jsonl


class SecureDatasetWriter:
    """
    Centralized dataset writes keep the training schema backend-owned.

    Security fixes:
    - only sanitized raw events are written to the event log
    - only backend-derived feature vectors are written to the training dataset
    - predictions are explicitly excluded from the training dataset schema
    """

    def __init__(self, dataset_path: Path, event_path: Path, prediction_log_path: Path) -> None:
        self.dataset_path = dataset_path
        self.event_path = event_path
        self.prediction_log_path = prediction_log_path
        self._lock = threading.Lock()

    def append_events(self, *, user_id: str, session_id: str, events: Sequence[NormalizedEvent]) -> int:
        if not events:
            return 0
        appended = 0
        with self._lock:
            for event in events:
                payload = {
                    "user_id": user_id,
                    "session_id": session_id,
                    **event_to_dict(event),
                }
                safe_append_jsonl(self.event_path, payload, managed_root=DATA_ROOT)
                appended += 1
        return appended

    def append_training_sample(
        self,
        *,
        user_id: str,
        session_id: str,
        timestamp: int,
        features: Sequence[Any],
        source_event_count: int,
    ) -> None:
        feature_vector = validate_feature_vector(features)
        payload = {
            "user_id": user_id,
            "session_id": session_id,
            "timestamp": int(timestamp),
            "source_event_count": int(source_event_count),
            "features": feature_vector,
        }
        with self._lock:
            safe_append_jsonl(self.dataset_path, payload, managed_root=DATA_ROOT)

    def append_prediction_log(
        self,
        *,
        user_id: str,
        session_id: str,
        timestamp: int,
        prediction: dict[str, Any],
        route: str | None = None,
    ) -> None:
        # Predictions are stored separately so analytics can use them without polluting training data.
        payload = {
            "user_id": user_id,
            "session_id": session_id,
            "timestamp": int(timestamp),
            "route": route or "/",
            "prediction": prediction,
        }
        with self._lock:
            safe_append_jsonl(self.prediction_log_path, payload, managed_root=DATA_ROOT)
