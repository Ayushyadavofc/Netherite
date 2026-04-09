from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from statistics import fmean, pstdev
from typing import Any, Mapping, Sequence

from .config import EVENT_WINDOW_MS, FEATURE_BUCKET_MS, FEATURE_LIMITS, FEATURE_NAMES, WINDOW_SIZE

ALLOWED_EVENT_TYPES = {
    "key_down",
    "mouse_move",
    "route_change",
    "visibility_change",
    "focus",
    "scroll",
    "study_action",
    "webcam_signal",
}
ALLOWED_KEY_CLASSES = {"character", "backspace", "delete", "enter", "modifier", "navigation", "other"}
MAX_ROUTE_LENGTH = 128
MAX_ACTION_LENGTH = 64
MAX_ABS_MOUSE_DELTA = 5_000.0


class FeatureEngineeringError(ValueError):
    """Raised when raw client events are missing required fields or contain invalid values."""


@dataclass(frozen=True)
class NormalizedEvent:
    timestamp: int
    type: str
    key_class: str | None = None
    route: str | None = None
    action: str | None = None
    hidden: bool | None = None
    dx: float = 0.0
    dy: float = 0.0
    fatigue_score: float | None = None
    confidence: float | None = None


def _as_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FeatureEngineeringError(f"{field_name} must be a number.")
    return int(value)


def _as_float(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FeatureEngineeringError(f"{field_name} must be a number.")
    numeric = float(value)
    if not math.isfinite(numeric):
        raise FeatureEngineeringError(f"{field_name} must be finite.")
    return numeric


def _sanitize_text(value: Any, field_name: str, max_length: int) -> str:
    if value is None:
        raise FeatureEngineeringError(f"{field_name} is required.")
    if not isinstance(value, str):
        raise FeatureEngineeringError(f"{field_name} must be a string.")
    sanitized = " ".join(value.strip().split())
    if not sanitized:
        raise FeatureEngineeringError(f"{field_name} cannot be empty.")
    if len(sanitized) > max_length:
        raise FeatureEngineeringError(f"{field_name} exceeds the {max_length}-character limit.")
    return sanitized


def normalize_event(payload: Mapping[str, Any]) -> NormalizedEvent:
    event_type = _sanitize_text(payload.get("type"), "event.type", 32)
    if event_type not in ALLOWED_EVENT_TYPES:
        raise FeatureEngineeringError(f"event.type '{event_type}' is not supported.")

    timestamp = _as_int(payload.get("timestamp"), "event.timestamp")
    key_class = payload.get("key_class")
    route = payload.get("route")
    action = payload.get("action")
    hidden = payload.get("hidden")
    dx = 0.0
    dy = 0.0
    fatigue_score = None
    confidence = None

    if event_type == "key_down":
        if key_class is None:
            key_class = "character"
        key_class = _sanitize_text(key_class, "event.key_class", 16).lower()
        if key_class not in ALLOWED_KEY_CLASSES:
            raise FeatureEngineeringError(f"event.key_class '{key_class}' is not supported.")

    if event_type in {"route_change", "focus", "study_action"} and route is not None:
        route = _sanitize_text(route, "event.route", MAX_ROUTE_LENGTH)

    if event_type == "route_change" and route is None:
        route = _sanitize_text(payload.get("route"), "event.route", MAX_ROUTE_LENGTH)

    if event_type == "study_action":
        action = _sanitize_text(payload.get("action"), "event.action", MAX_ACTION_LENGTH)

    if event_type == "visibility_change":
        if not isinstance(hidden, bool):
            raise FeatureEngineeringError("event.hidden must be a boolean for visibility_change events.")

    if event_type == "mouse_move":
        dx = max(min(_as_float(payload.get("dx", 0.0), "event.dx"), MAX_ABS_MOUSE_DELTA), -MAX_ABS_MOUSE_DELTA)
        dy = max(min(_as_float(payload.get("dy", 0.0), "event.dy"), MAX_ABS_MOUSE_DELTA), -MAX_ABS_MOUSE_DELTA)

    if event_type == "webcam_signal":
        fatigue_score = _as_float(payload.get("fatigue_score"), "event.fatigue_score")
        confidence = _as_float(payload.get("confidence", 1.0), "event.confidence")
        if not 0.0 <= fatigue_score <= 1.0:
            raise FeatureEngineeringError("event.fatigue_score must be between 0 and 1.")
        if not 0.0 <= confidence <= 1.0:
            raise FeatureEngineeringError("event.confidence must be between 0 and 1.")

    return NormalizedEvent(
        timestamp=timestamp,
        type=event_type,
        key_class=key_class,
        route=route,
        action=action,
        hidden=hidden,
        dx=dx,
        dy=dy,
        fatigue_score=fatigue_score,
        confidence=confidence,
    )


def sanitize_events(events: Sequence[Mapping[str, Any]]) -> list[NormalizedEvent]:
    normalized = [normalize_event(event) for event in events]
    return sorted(normalized, key=lambda item: item.timestamp)


def event_to_dict(event: NormalizedEvent) -> dict[str, Any]:
    return asdict(event)


def _bucket_index(timestamp: int, start_time: int) -> int:
    return int((timestamp - start_time) // FEATURE_BUCKET_MS)


def _clamp_feature(name: str, value: float) -> float:
    lower, upper = FEATURE_LIMITS[name]
    return round(min(max(float(value), lower), upper), 4)


def build_feature_matrix(
    events: Sequence[NormalizedEvent],
    *,
    session_started_at: int | None = None,
    window_end_at: int | None = None,
) -> list[list[float]]:
    if not events:
        raise FeatureEngineeringError("At least one raw event is required.")

    ordered = list(events)
    end_at = int(window_end_at or ordered[-1].timestamp)
    start_at = end_at - EVENT_WINDOW_MS + FEATURE_BUCKET_MS
    session_start = int(session_started_at or ordered[0].timestamp)

    buckets = [
        {
            "key_timestamps": [],
            "backspace_count": 0,
            "mouse_distance": 0.0,
            "tab_switches": 0,
            "activity_timestamps": [],
            "fatigue_weight": 0.0,
            "fatigue_total": 0.0,
        }
        for _ in range(WINDOW_SIZE)
    ]

    last_key_timestamp: int | None = None
    for event in ordered:
        if event.timestamp < start_at or event.timestamp > end_at:
            continue
        bucket_idx = _bucket_index(event.timestamp, start_at)
        if bucket_idx < 0 or bucket_idx >= WINDOW_SIZE:
            continue
        bucket = buckets[bucket_idx]
        bucket["activity_timestamps"].append(event.timestamp)

        if event.type == "key_down":
            bucket["key_timestamps"].append(event.timestamp)
            if event.key_class in {"backspace", "delete"}:
                bucket["backspace_count"] += 1
            last_key_timestamp = event.timestamp
        elif event.type == "mouse_move":
            bucket["mouse_distance"] += math.hypot(event.dx, event.dy)
        elif event.type == "route_change":
            bucket["tab_switches"] += 1
        elif event.type == "visibility_change" and event.hidden:
            bucket["tab_switches"] += 1
        elif event.type == "webcam_signal" and event.fatigue_score is not None:
            confidence = event.confidence if event.confidence is not None else 1.0
            bucket["fatigue_total"] += event.fatigue_score * confidence
            bucket["fatigue_weight"] += confidence

    feature_matrix: list[list[float]] = []
    bucket_seconds = FEATURE_BUCKET_MS / 1000.0
    for index, bucket in enumerate(buckets):
        key_timestamps: list[int] = bucket["key_timestamps"]
        key_gaps = [
            min((current - previous) / 1000.0, 10.0)
            for previous, current in zip(key_timestamps, key_timestamps[1:])
        ]
        typing_speed = len(key_timestamps) / bucket_seconds
        pause_time = fmean(key_gaps) if key_gaps else 0.0
        variation = pstdev(key_gaps) if len(key_gaps) >= 2 else 0.0
        error_score = bucket["backspace_count"] / max(len(key_timestamps), 1)

        bucket_start = start_at + (index * FEATURE_BUCKET_MS)
        bucket_end = bucket_start + FEATURE_BUCKET_MS
        activity_timestamps: list[int] = sorted(bucket["activity_timestamps"])
        if activity_timestamps:
            boundaries = [bucket_start, *activity_timestamps, bucket_end]
            idle_time = max((right - left) / 1000.0 for left, right in zip(boundaries, boundaries[1:]))
        else:
            idle_time = bucket_seconds

        mouse_movement_speed = (bucket["mouse_distance"] / bucket_seconds) / 100.0
        tab_switch_frequency = bucket["tab_switches"] / 10.0
        session_duration = max(((bucket_end - session_start) / 60_000.0), 0.0)
        fatigue_score = (
            bucket["fatigue_total"] / bucket["fatigue_weight"]
            if bucket["fatigue_weight"] > 0
            else 0.0
        )

        feature_matrix.append(
            [
                _clamp_feature("typing_speed", typing_speed),
                _clamp_feature("pause_time", pause_time),
                _clamp_feature("variation", variation),
                _clamp_feature("error_score", error_score),
                _clamp_feature("idle_time", idle_time),
                _clamp_feature("mouse_movement_speed", mouse_movement_speed),
                _clamp_feature("tab_switch_frequency", tab_switch_frequency),
                _clamp_feature("session_duration", session_duration),
                _clamp_feature("fatigue_score", fatigue_score),
            ]
        )

    if len(feature_matrix) != WINDOW_SIZE:
        raise FeatureEngineeringError("Feature engineering did not produce the expected number of windows.")

    return feature_matrix


def validate_feature_vector(features: Sequence[Any]) -> list[float]:
    if len(features) != len(FEATURE_NAMES):
        raise FeatureEngineeringError(f"Expected {len(FEATURE_NAMES)} backend features, got {len(features)}.")
    sanitized: list[float] = []
    for name, raw_value in zip(FEATURE_NAMES, features):
        numeric = _as_float(raw_value, f"feature.{name}")
        sanitized.append(_clamp_feature(name, numeric))
    return sanitized
