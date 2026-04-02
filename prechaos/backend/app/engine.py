from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Sequence

import joblib
import numpy as np
import torch
from sklearn.preprocessing import StandardScaler

from .config import (
    BASELINE_PATH,
    FEATURE_NAMES,
    FEEDBACK_PATH,
    LIVE_DATA_PATH,
    LIVE_EVENT_PATH,
    LIVE_TRAINING_META_PATH,
    MODEL_ROOT,
    SCALER_PATH,
    TRAINED_MODEL_PATH,
    WINDOW_SIZE,
)
from .model import PreChaosTransformer


def _ensure_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _safe_mean_std(values: np.ndarray) -> Dict[str, List[float]]:
    means = values.mean(axis=0)
    stds = values.std(axis=0)
    stds = np.where(stds < 1e-3, 1.0, stds)
    return {"mean": means.tolist(), "std": stds.tolist()}


@dataclass
class PredictionResult:
    risk: float
    status: str
    state: str
    confidence: float
    focus_score: float
    fatigue_score: float
    distraction_score: float
    reflection_score: float
    uncertainty_score: float
    insights: List[str]
    dominant_signals: List[Dict[str, float]]
    attention: List[float]
    model_risk: float
    correction_factor: float
    baseline_ready: bool
    mode: str
    context_summary: str
    page_explanation: str


class PreChaosEngine:
    def __init__(self) -> None:
        MODEL_ROOT.mkdir(parents=True, exist_ok=True)
        self.device = torch.device("cpu")
        self.model = PreChaosTransformer(feature_dim=len(FEATURE_NAMES))
        self.model.to(self.device)
        self.model.eval()
        self.scaler = StandardScaler()
        self.mode = "demo"
        self.feedback_state = self._load_json(
            FEEDBACK_PATH,
            {"correction_factors": [1.0] * 24, "events": []},
        )
        self.baseline_state = self._load_json(
            BASELINE_PATH,
            {
                "feature_names": FEATURE_NAMES,
                "samples_seen": 0,
                "global": {
                    "mean": [1.0, 0.4, 0.15, 0.1, 0.1, 0.5, 0.1, 5.0, 0.0],
                    "std": [0.5, 0.2, 0.1, 0.08, 0.1, 0.3, 0.1, 3.0, 0.1],
                },
                "users": {},
            },
        )
        self._initialize_demo_weights()
        self._load_trained_artifacts_if_available()

    def _load_json(self, path: Path, default: Dict) -> Dict:
        _ensure_dir(path)
        if not path.exists():
            path.write_text(json.dumps(default, indent=2), encoding="utf-8")
            return default
        return json.loads(path.read_text(encoding="utf-8"))

    def _save_json(self, path: Path, payload: Dict) -> None:
        _ensure_dir(path)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _initialize_demo_weights(self) -> None:
        with torch.no_grad():
            for parameter in self.model.parameters():
                parameter.zero_()
            feature_dim = len(FEATURE_NAMES)
            self.model.input_projection.weight.zero_()
            for i in range(feature_dim):
                self.model.input_projection.weight[i, i] = 1.0
            if self.model.input_projection.bias is not None:
                self.model.input_projection.bias.zero_()
            final_linear = self.model.head[-1]
            penultimate = self.model.head[1]
            penultimate.weight.zero_()
            penultimate.bias.zero_()
            risk_directions = torch.tensor(
                [-0.9, 1.2, 1.1, 0.8, 0.8, 0.4, 0.5, 0.3, 0.6], dtype=torch.float32
            )
            for i in range(min(len(risk_directions), penultimate.weight.shape[0])):
                penultimate.weight[i, i] = risk_directions[i]
            final_linear.weight.zero_()
            final_linear.bias.fill_(-0.15)
            final_linear.weight[0, : len(risk_directions)] = 0.25

    def _load_trained_artifacts_if_available(self) -> None:
        if TRAINED_MODEL_PATH.exists():
            state = torch.load(TRAINED_MODEL_PATH, map_location=self.device)
            self.model.load_state_dict(state)
            self.mode = "trained"
        if SCALER_PATH.exists():
            self.scaler = joblib.load(SCALER_PATH)

    def reload_artifacts(self) -> None:
        self.model = PreChaosTransformer(feature_dim=len(FEATURE_NAMES))
        self.model.to(self.device)
        self.model.eval()
        self.scaler = StandardScaler()
        self.mode = "demo"
        self._initialize_demo_weights()
        self._load_trained_artifacts_if_available()

    def _resolve_baseline(self, user_id: str | None) -> Dict[str, Sequence[float]]:
        if user_id and user_id in self.baseline_state["users"]:
            return self.baseline_state["users"][user_id]
        return self.baseline_state["global"]

    def _normalize_features(self, features: np.ndarray, user_id: str | None) -> np.ndarray:
        baseline = self._resolve_baseline(user_id)
        means = np.array(baseline["mean"], dtype=np.float32)
        stds = np.array(baseline["std"], dtype=np.float32)
        clipped = np.nan_to_num(features, nan=0.0, posinf=3.0, neginf=-3.0)
        clipped = np.clip(clipped, 0.0, np.quantile(clipped + 1e-6, 0.98) + 1.0)
        if self.mode == "trained" and SCALER_PATH.exists():
            scaled = self.scaler.transform(clipped)
            personalized = (clipped - means) / np.where(stds < 1e-3, 1.0, stds)
            normalized = (scaled + personalized) / 2.0
        else:
            normalized = (clipped - means) / np.where(stds < 1e-3, 1.0, stds)
        smoothed = normalized.copy()
        if len(smoothed) > 2:
            for idx in range(1, len(smoothed)):
                smoothed[idx] = 0.75 * smoothed[idx] + 0.25 * smoothed[idx - 1]
        return smoothed.astype(np.float32)

    def _status_for_risk(self, risk: float) -> str:
        if risk < 0.35:
            return "low"
        if risk <= 0.65:
            return "medium"
        return "high"

    def _derive_state(
        self,
        risk: float,
        fatigue_score: float,
        focus_score: float,
        distraction_score: float,
        reflection_score: float,
        uncertainty_score: float,
        context: dict | None,
        raw_features: np.ndarray,
    ) -> tuple[str, float, str]:
        context = context or {}
        latest = raw_features[-1]
        productive_context = bool(context.get("productive_context", False))
        reading_mode = bool(context.get("reading_mode", False))
        focused_editable = bool(context.get("focused_editable", False))
        route = str(context.get("route", "/"))
        route_switches = float(context.get("route_switches", 0))
        recent_actions = float(context.get("recent_meaningful_actions", 0))
        idle_time = float(latest[4])
        variation = float(latest[2])

        if uncertainty_score >= 0.58:
            return "uncertain", round(float(np.clip(0.36 + uncertainty_score * 0.24, 0.0, 0.82)), 4), (
                f"Signals are mixed in {route.replace('/', '') or 'the app'}, so the system is less certain than usual."
            )

        if fatigue_score >= 0.7:
            return "fatigued", round(float(np.clip(0.62 + fatigue_score * 0.25, 0.0, 0.98)), 4), (
                f"Fatigue cues are elevated while you work in {route.replace('/', '') or 'the app'}."
            )
        if productive_context and (reading_mode or (focused_editable and idle_time < 18 and recent_actions >= 2)):
            if risk < 0.45:
                return "reflective", round(float(np.clip(0.56 + focus_score * 0.32, 0.0, 0.95)), 4), (
                    f"Quiet but engaged behavior suggests reflective work in {route.replace('/', '') or 'the app'}."
                )
        if focus_score >= 0.68 and risk < 0.42:
            return "focused", round(float(np.clip(0.58 + focus_score * 0.3, 0.0, 0.97)), 4), (
                f"Steady interaction and context indicate focused work in {route.replace('/', '') or 'the app'}."
            )
        if risk >= 0.72 or (variation > 0.18 and route_switches >= 2):
            return "overloaded", round(float(np.clip(0.62 + risk * 0.28, 0.0, 0.98)), 4), (
                "Rapid context switching and instability suggest overload."
            )
        if reflection_score >= 0.62 and productive_context and risk < 0.52:
            return "reflective", round(float(np.clip(0.5 + reflection_score * 0.28, 0.0, 0.93)), 4), (
                f"The pace in {route.replace('/', '') or 'the app'} looks more reflective than fragmented."
            )
        if distraction_score >= 0.55 or risk >= 0.5:
            return "distracted", round(float(np.clip(0.52 + risk * 0.3, 0.0, 0.95)), 4), (
                "Interaction patterns look more fragmented than deliberate."
            )
        return "steady", round(float(np.clip(0.48 + focus_score * 0.22, 0.0, 0.9)), 4), (
            "Behavior is stable, with no strong signs of fatigue or fragmentation."
        )

    def _compute_mental_scores(
        self, raw_features: np.ndarray, context: dict | None
    ) -> tuple[float, float, float, float, float]:
        context = context or {}
        latest = raw_features[-1]
        typing_speed = float(latest[0])
        pause_time = float(latest[1])
        variation = float(latest[2])
        error_score = float(latest[3])
        idle_time = float(latest[4])
        tab_switches = float(latest[6])
        fatigue_signal = float(latest[8])
        productive_context = 1.0 if context.get("productive_context", False) else 0.0
        focused_editable = 1.0 if context.get("focused_editable", False) else 0.0
        reading_mode = 1.0 if context.get("reading_mode", False) else 0.0
        recent_actions = float(context.get("recent_meaningful_actions", 0))
        recent_event_density = float(context.get("recent_event_density", 0))
        route_dwell_seconds = float(context.get("route_dwell_seconds", 0))
        note_switches = float(context.get("note_switches", 0))
        note_saves = float(context.get("note_saves", 0))
        flashcard_answer_latency = float(context.get("flashcard_answer_latency", 0))
        flashcard_successes = float(context.get("flashcard_successes", 0))
        todo_completions = float(context.get("todo_completions", 0))
        habit_check_ins = float(context.get("habit_check_ins", 0))
        progress_events = float(context.get("progress_events", 0))
        page_name = str(context.get("page_name", "other"))

        focus_score = 0.32
        focus_score += min(typing_speed * 0.18, 0.22)
        focus_score += productive_context * 0.14
        focus_score += focused_editable * 0.12
        focus_score += min(recent_actions * 0.04, 0.16)
        focus_score += reading_mode * 0.1
        focus_score += min(todo_completions * 0.08, 0.12)
        focus_score += min(habit_check_ins * 0.06, 0.1)
        focus_score += min(note_saves * 0.08, 0.12)
        focus_score += min(flashcard_successes * 0.08, 0.14)
        focus_score += min(progress_events * 0.03, 0.12)
        focus_score -= min(max(pause_time - 0.6, 0.0) * 0.2, 0.18)
        focus_score -= min(variation * 0.45, 0.18)
        focus_score -= min(error_score * 0.35, 0.16)
        focus_score -= min(tab_switches * 0.12, 0.15)
        focus_score -= min(max(idle_time - 12.0, 0.0) * 0.018, 0.14)

        fatigue_score = 0.12
        fatigue_score += min(fatigue_signal * 0.55, 0.48)
        fatigue_score += min(max(idle_time - 10.0, 0.0) * 0.02, 0.18)
        fatigue_score += min(max(pause_time - 0.8, 0.0) * 0.18, 0.14)
        fatigue_score += min(variation * 0.22, 0.12)
        fatigue_score -= min(typing_speed * 0.06, 0.08)

        distraction_score = 0.14
        distraction_score += min(tab_switches * 0.18, 0.24)
        distraction_score += min(variation * 0.58, 0.24)
        distraction_score += min(error_score * 0.36, 0.18)
        distraction_score += min(max(idle_time - 8.0, 0.0) * 0.018, 0.18)
        distraction_score += min(note_switches * 0.08, 0.14)
        distraction_score -= min(recent_actions * 0.03, 0.12)
        distraction_score -= min(todo_completions * 0.06, 0.08)
        distraction_score -= min(note_saves * 0.04, 0.07)
        distraction_score -= min(flashcard_successes * 0.05, 0.08)
        distraction_score -= min(progress_events * 0.025, 0.1)
        distraction_score -= productive_context * 0.04

        reflection_score = 0.18
        reflection_score += reading_mode * 0.22
        reflection_score += productive_context * 0.08
        reflection_score += min(route_dwell_seconds / 90.0, 0.16)
        reflection_score += 0.12 if page_name == "flashcards" and 1.4 <= flashcard_answer_latency <= 8.0 else 0.0
        reflection_score += 0.1 if page_name == "notes" and focused_editable == 0.0 and recent_actions >= 2 else 0.0
        reflection_score += min(note_saves * 0.05, 0.08)
        reflection_score -= min(tab_switches * 0.1, 0.14)
        reflection_score -= min(error_score * 0.15, 0.08)

        uncertainty_score = 0.12
        uncertainty_score += 0.18 if recent_event_density < 0.25 and typing_speed < 0.08 and idle_time < 12 else 0.0
        uncertainty_score += 0.14 if productive_context and focused_editable == 0.0 and reading_mode == 0.0 and recent_actions > 0 else 0.0
        uncertainty_score += 0.14 if abs(focus_score - distraction_score) < 0.12 else 0.0
        uncertainty_score += 0.1 if page_name == "other" else 0.0
        uncertainty_score -= min(recent_actions * 0.02, 0.1)

        if page_name == "flashcards":
            reflection_score += 0.08
            distraction_score -= 0.04
        elif page_name == "todos":
            focus_score += 0.06
            distraction_score -= min(todo_completions * 0.04, 0.06)
        elif page_name == "habits":
            focus_score += min(habit_check_ins * 0.04, 0.06)
        elif page_name == "notes":
            reflection_score += 0.06
            uncertainty_score -= 0.04

        return (
            float(np.clip(focus_score, 0.0, 1.0)),
            float(np.clip(fatigue_score, 0.0, 1.0)),
            float(np.clip(distraction_score, 0.0, 1.0)),
            float(np.clip(reflection_score, 0.0, 1.0)),
            float(np.clip(uncertainty_score, 0.0, 1.0)),
        )

    def _page_explanation(self, context: dict | None, raw_features: np.ndarray) -> str:
        context = context or {}
        page_name = str(context.get("page_name", "other"))
        latest = raw_features[-1]
        pause_time = float(latest[1])
        route_switches = float(context.get("route_switches", 0))
        flashcard_answer_latency = float(context.get("flashcard_answer_latency", 0))
        flashcard_successes = float(context.get("flashcard_successes", 0))
        todo_completions = float(context.get("todo_completions", 0))
        note_switches = float(context.get("note_switches", 0))
        note_saves = float(context.get("note_saves", 0))
        habit_check_ins = float(context.get("habit_check_ins", 0))

        if page_name == "flashcards":
            if flashcard_successes >= 1:
                return "Strong Flashcard answers are now treated as productive progress and directly reduce instability risk."
            if 1.4 <= flashcard_answer_latency <= 8.0 and route_switches < 2:
                return "Long recall pauses on Flashcards are being treated as normal memory retrieval, not immediate distraction."
            return "Flashcard scoring now pays attention to answer latency and rapid switching more than raw silence."
        if page_name == "notes":
            if note_saves >= 1:
                return "Saving or creating notes is treated as strong productive progress, so risk is reduced after note work lands."
            if note_switches >= 2:
                return "Frequent note switching is being treated as a stronger distraction signal than quiet drafting pauses."
            if pause_time <= 1.2:
                return "Short pauses in Notes are being interpreted as drafting or planning, especially when the workspace stays active."
            return "Notes scoring balances writing bursts with reflective pauses so thinking time is not over-penalized."
        if page_name == "todos":
            if todo_completions >= 1:
                return "Todo completions now directly lower instability because task closure is treated as productive progress."
            return "Todo scoring emphasizes completion bursts and route stability more than continuous typing."
        if page_name == "habits":
            if habit_check_ins >= 1:
                return "Habit check-ins now directly lower instability even when typing stays low."
            return "Habits scoring expects lighter interaction and avoids overreacting to low typing."
        return "General scoring blends typing, idle, switching, and recent actions because the page context is less specialized."

    def _heuristic_risk(self, raw_features: np.ndarray) -> float:
        latest = raw_features[-1]
        typing_speed = float(latest[0])
        pause_time = float(latest[1])
        variation = float(latest[2])
        error_score = float(latest[3])
        idle_time = float(latest[4])
        mouse_speed = float(latest[5])
        tab_switches = float(latest[6])
        activity_level = typing_speed + mouse_speed + (tab_switches * 2.0)

        if activity_level < 0.2 and idle_time >= 2.0:
            return float(np.clip(0.12 + min(idle_time / 40.0, 0.18), 0.1, 0.3))

        heuristic = 0.18
        heuristic += min(max((0.55 - typing_speed) * 0.08, 0.0), 0.16)
        heuristic += min(max((pause_time - 0.45) * 0.35, 0.0), 0.24)
        heuristic += min(max((variation - 0.12) * 1.1, 0.0), 0.22)
        heuristic += min(max((error_score - 0.08) * 1.4, 0.0), 0.2)
        heuristic += min(max((idle_time - 6.0) * 0.015, 0.0), 0.12)
        heuristic += min(tab_switches * 0.04, 0.08)
        return float(np.clip(heuristic, 0.05, 0.92))

    def _build_insights(
        self,
        raw_features: np.ndarray,
        normalized_features: np.ndarray,
        attention: np.ndarray,
    ) -> tuple[list[str], list[dict[str, float]]]:
        weighted_signal = np.abs(normalized_features) * attention[:, None]
        feature_weights = weighted_signal.sum(axis=0)
        top_indices = feature_weights.argsort()[::-1][:3]
        dominant_signals: list[dict[str, float]] = []
        insights: list[str] = []
        latest = raw_features[-1]
        for idx in top_indices:
            strength = float(feature_weights[idx])
            dominant_signals.append({"feature": FEATURE_NAMES[idx], "score": round(strength, 4)})
            if FEATURE_NAMES[idx] == "pause_time":
                insights.append(f"High pause_time is elevating instability risk ({latest[idx]:.2f}).")
            elif FEATURE_NAMES[idx] == "variation":
                insights.append(f"Recent variation spike is contributing heavily ({latest[idx]:.2f}).")
            elif FEATURE_NAMES[idx] == "typing_speed":
                insights.append(f"Typing_speed trend shifted from baseline ({latest[idx]:.2f}).")
            elif FEATURE_NAMES[idx] == "idle_time":
                insights.append(f"Idle_time drift suggests attention fragmentation ({latest[idx]:.2f}).")
            else:
                insights.append(f"{FEATURE_NAMES[idx]} is a dominant contributor right now.")
        return insights, dominant_signals

    def predict(
        self, features: Sequence[Sequence[float]], user_id: str | None = None, context: dict | None = None
    ) -> PredictionResult:
        array = np.asarray(features, dtype=np.float32)
        if array.ndim != 2:
            raise ValueError("features must be a 2D array")
        if array.shape[1] != len(FEATURE_NAMES):
            raise ValueError(f"expected {len(FEATURE_NAMES)} features per timestep")
        if array.shape[0] < WINDOW_SIZE:
            missing = WINDOW_SIZE - array.shape[0]
            padding = np.repeat(array[:1], missing, axis=0) if len(array) else np.zeros((WINDOW_SIZE, len(FEATURE_NAMES)))
            array = np.concatenate([padding, array], axis=0)
        elif array.shape[0] > WINDOW_SIZE:
            array = array[-WINDOW_SIZE:]

        normalized = self._normalize_features(array, user_id)
        tensor = torch.from_numpy(normalized).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits, attention_weights = self.model(tensor)
            model_risk = float(torch.sigmoid(logits).item())
        heuristic_risk = self._heuristic_risk(array)
        activity_level = float(array[-1][0] + array[-1][5] + array[-1][6] * 2.0)
        if self.mode == "trained":
            blend_weight = 0.25 if activity_level < 0.2 else 0.4
            blended_risk = (model_risk * blend_weight) + (heuristic_risk * (1.0 - blend_weight))
        else:
            blended_risk = (model_risk * 0.45) + (heuristic_risk * 0.55)
        if context:
            if context.get("productive_context") and context.get("focused_editable"):
                blended_risk *= 0.9
            if context.get("reading_mode"):
                blended_risk *= 0.88
            activity_bonus = min(float(context.get("recent_meaningful_actions", 0)) * 0.015, 0.08)
            blended_risk = max(0.03, blended_risk - activity_bonus)
            progress_bonus = min(
                float(context.get("todo_completions", 0)) * 0.05
                + float(context.get("habit_check_ins", 0)) * 0.045
                + float(context.get("flashcard_successes", 0)) * 0.04
                + float(context.get("note_saves", 0)) * 0.035
                + float(context.get("progress_events", 0)) * 0.018,
                0.22,
            )
            blended_risk = max(0.02, blended_risk - progress_bonus)
            route_switch_penalty = min(float(context.get("route_switches", 0)) * 0.03, 0.12)
            blended_risk = min(0.98, blended_risk + route_switch_penalty)
        hour = datetime.now().hour
        factor = float(self.feedback_state["correction_factors"][hour])
        final_risk = float(np.clip(blended_risk * factor, 0.0, 1.0))
        attention = attention_weights.squeeze(0).cpu().numpy()
        focus_score, fatigue_score, distraction_score, reflection_score, uncertainty_score = self._compute_mental_scores(
            array, context
        )
        state, confidence, context_summary = self._derive_state(
            final_risk,
            fatigue_score,
            focus_score,
            distraction_score,
            reflection_score,
            uncertainty_score,
            context,
            array,
        )
        page_explanation = self._page_explanation(context, array)
        insights, dominant_signals = self._build_insights(array, normalized, attention)
        if page_explanation not in insights:
            insights = [context_summary, page_explanation, *insights][:5]
        return PredictionResult(
            risk=round(final_risk, 4),
            status=self._status_for_risk(final_risk),
            state=state,
            confidence=confidence,
            focus_score=round(focus_score, 4),
            fatigue_score=round(fatigue_score, 4),
            distraction_score=round(distraction_score, 4),
            reflection_score=round(reflection_score, 4),
            uncertainty_score=round(uncertainty_score, 4),
            insights=insights,
            dominant_signals=dominant_signals,
            attention=[round(float(value), 4) for value in attention.tolist()],
            model_risk=round(blended_risk, 4),
            correction_factor=round(factor, 4),
            baseline_ready=bool(self.baseline_state.get("samples_seen", 0) >= WINDOW_SIZE),
            mode=self.mode,
            context_summary=context_summary,
            page_explanation=page_explanation,
        )

    def submit_feedback(self, user_id: str, label: str, risk: float) -> Dict[str, float | str]:
        hour = datetime.now().hour
        factors = self.feedback_state["correction_factors"]
        current_factor = float(factors[hour])
        updated = current_factor
        if label == "focused" and risk >= 0.65:
            updated -= 0.05
        elif label == "thinking" and risk >= 0.52:
            updated -= 0.035
        elif label == "distracted" and risk <= 0.35:
            updated += 0.05
        elif label == "tired" and risk <= 0.48:
            updated += 0.04
        updated = float(np.clip(updated, 0.6, 1.4))
        factors[hour] = round(updated, 4)
        self.feedback_state["events"].append(
            {
                "user_id": user_id,
                "label": label,
                "risk": risk,
                "hour": hour,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
        self.feedback_state["events"] = self.feedback_state["events"][-2000:]
        self._save_json(FEEDBACK_PATH, self.feedback_state)
        return {"hour": hour, "correction_factor": factors[hour], "label": label}

    def update_baseline(self, user_id: str, features: Sequence[Sequence[float]]) -> Dict:
        array = np.asarray(features, dtype=np.float32)
        if array.ndim != 2 or array.shape[1] != len(FEATURE_NAMES):
            raise ValueError("invalid baseline feature shape")
        clipped = np.nan_to_num(array, nan=0.0, posinf=0.0, neginf=0.0)
        summary = _safe_mean_std(clipped)
        self.baseline_state["users"][user_id] = summary
        self.baseline_state["global"] = _safe_mean_std(
            np.concatenate([clipped, np.asarray(self.baseline_state["global"]["mean"], dtype=np.float32)[None, :]], axis=0)
        )
        self.baseline_state["samples_seen"] = int(self.baseline_state.get("samples_seen", 0)) + len(array)
        self._save_json(BASELINE_PATH, self.baseline_state)
        return {
            "user_id": user_id,
            "samples_seen": self.baseline_state["samples_seen"],
            "baseline": summary,
            "feature_names": FEATURE_NAMES,
        }

    def get_baseline(self, user_id: str | None = None) -> Dict:
        baseline = self._resolve_baseline(user_id)
        return {
            "user_id": user_id or "global",
            "samples_seen": self.baseline_state.get("samples_seen", 0),
            "feature_names": FEATURE_NAMES,
            "baseline": baseline,
            "correction_factors": self.feedback_state["correction_factors"],
            "mode": self.mode,
        }

    def append_live_samples(
        self,
        user_id: str,
        session_id: str,
        samples: Sequence[dict],
        events: Sequence[dict] | None = None,
    ) -> Dict[str, int | bool]:
        _ensure_dir(LIVE_DATA_PATH)
        _ensure_dir(LIVE_EVENT_PATH)
        appended_samples = 0
        appended_events = 0
        with LIVE_DATA_PATH.open("a", encoding="utf-8") as sample_file:
            for sample in samples:
                payload = {
                    "user_id": user_id,
                    "session_id": session_id,
                    "timestamp": sample.get("timestamp"),
                    "features": sample.get("features"),
                    "context": sample.get("context", {}),
                    "prediction": sample.get("prediction"),
                }
                sample_file.write(json.dumps(payload) + "\n")
                appended_samples += 1
        if events:
            with LIVE_EVENT_PATH.open("a", encoding="utf-8") as event_file:
                for event in events:
                    event_file.write(
                        json.dumps(
                            {
                                "user_id": user_id,
                                "session_id": session_id,
                                **event,
                            }
                        )
                        + "\n"
                    )
                    appended_events += 1
        return {
            "appended_samples": appended_samples,
            "appended_events": appended_events,
            "ready_for_training": self.get_live_dataset_status()["ready_for_training"],
        }

    def get_live_dataset_status(self) -> Dict[str, int | bool | str | None]:
        sample_count = 0
        sessions: set[str] = set()
        if LIVE_DATA_PATH.exists():
            with LIVE_DATA_PATH.open("r", encoding="utf-8") as sample_file:
                for line in sample_file:
                    if not line.strip():
                        continue
                    sample_count += 1
                    try:
                        payload = json.loads(line)
                        sessions.add(str(payload.get("session_id", "unknown")))
                    except json.JSONDecodeError:
                        continue
        last_trained_at = None
        if LIVE_TRAINING_META_PATH.exists():
            try:
                last_trained_at = json.loads(LIVE_TRAINING_META_PATH.read_text(encoding="utf-8")).get("last_trained_at")
            except json.JSONDecodeError:
                last_trained_at = None
        return {
            "sample_count": sample_count,
            "session_count": len(sessions),
            "ready_for_training": sample_count >= 900 and len(sessions) >= 4,
            "mode": self.mode,
            "last_trained_at": last_trained_at,
        }

    def get_recent_session_replays(self, limit: int = 8) -> list[dict]:
        if not LIVE_DATA_PATH.exists():
            return []

        grouped: dict[str, dict] = {}
        with LIVE_DATA_PATH.open("r", encoding="utf-8") as sample_file:
            for line in sample_file:
                if not line.strip():
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                session_id = str(payload.get("session_id", "unknown"))
                timestamp = int(payload.get("timestamp") or 0)
                context = payload.get("context", {}) or {}
                prediction = payload.get("prediction", {}) or {}
                route = str(context.get("route", "/"))
                state = str(prediction.get("state", "steady"))
                risk = float(prediction.get("risk", 0.0))
                entry = grouped.setdefault(
                    session_id,
                    {
                        "session_id": session_id,
                        "user_id": str(payload.get("user_id", "local-user")),
                        "timestamps": [],
                        "routes": {},
                        "states": {},
                        "timeline": [],
                    },
                )
                entry["timestamps"].append(timestamp)
                entry["routes"][route] = entry["routes"].get(route, 0) + 1
                entry["states"][state] = entry["states"].get(state, 0) + 1
                entry["timeline"].append(
                    {
                        "timestamp": timestamp,
                        "risk": round(risk, 4),
                        "state": state,
                        "route": route,
                    }
                )

        sessions: list[dict] = []
        for entry in grouped.values():
            timeline = sorted(entry["timeline"], key=lambda item: item["timestamp"])
            if not timeline:
                continue
            risks = [float(point.get("risk", 0.0)) for point in timeline]
            route_counts = entry["routes"]
            state_counts = entry["states"]
            sessions.append(
                {
                    "session_id": entry["session_id"],
                    "user_id": entry["user_id"],
                    "started_at": timeline[0]["timestamp"],
                    "ended_at": timeline[-1]["timestamp"],
                    "duration_seconds": round(max((timeline[-1]["timestamp"] - timeline[0]["timestamp"]) / 1000, 0), 2),
                    "sample_count": len(timeline),
                    "avg_risk": round(float(np.mean(risks)), 4),
                    "max_risk": round(float(np.max(risks)), 4),
                    "top_route": max(route_counts, key=route_counts.get) if route_counts else "/",
                    "state_summary": max(state_counts, key=state_counts.get) if state_counts else "steady",
                    "timeline": timeline[-24:],
                }
            )
        return sorted(sessions, key=lambda item: item["ended_at"], reverse=True)[:limit]
