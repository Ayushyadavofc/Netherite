from __future__ import annotations

from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import DEFAULT_HOST, DEFAULT_PORT, FEATURE_NAMES, LIVE_DATA_PATH
from .engine import PreChaosEngine
from .training import train_from_dataset

app = FastAPI(title="PreChaos AI", version="1.0.0")
engine = PreChaosEngine()


class PredictPayload(BaseModel):
    features: list[list[float]]
    user_id: Optional[str] = None
    context: Optional[dict] = None


class FeedbackPayload(BaseModel):
    user_id: str = Field(default="local-user")
    label: Literal["focused", "thinking", "distracted", "tired"]
    risk: float = Field(ge=0.0, le=1.0)


class BaselinePayload(BaseModel):
    user_id: str = Field(default="local-user")
    features: list[list[float]]


class TrainPayload(BaseModel):
    dataset_path: str
    epochs: int = Field(default=24, ge=1, le=100)
    batch_size: int = Field(default=32, ge=1, le=256)
    learning_rate: float = Field(default=1e-3, gt=0)


class CollectPayload(BaseModel):
    user_id: str = Field(default="local-user")
    session_id: str
    samples: list[dict]
    events: list[dict] = Field(default_factory=list)


@app.get("/health")
def healthcheck() -> dict:
    return {"ok": True, "host": DEFAULT_HOST, "port": DEFAULT_PORT, "features": FEATURE_NAMES}


@app.post("/predict")
def predict(payload: PredictPayload) -> dict:
    try:
        result = engine.predict(payload.features, payload.user_id, payload.context)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return result.__dict__


@app.post("/feedback")
def feedback(payload: FeedbackPayload) -> dict:
    return engine.submit_feedback(payload.user_id, payload.label, payload.risk)


@app.get("/baseline")
def get_baseline(user_id: Optional[str] = None) -> dict:
    return engine.get_baseline(user_id)


@app.post("/baseline")
def update_baseline(payload: BaselinePayload) -> dict:
    try:
        engine.update_baseline(payload.user_id, payload.features)
        return engine.get_baseline(payload.user_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/train")
def train(payload: TrainPayload) -> dict:
    artifacts = train_from_dataset(
        payload.dataset_path,
        epochs=payload.epochs,
        batch_size=payload.batch_size,
        learning_rate=payload.learning_rate,
    )
    return {
        "model_path": artifacts.model_path,
        "scaler_path": artifacts.scaler_path,
        "metrics": artifacts.metrics,
    }


@app.post("/collect")
def collect(payload: CollectPayload) -> dict:
    return engine.append_live_samples(payload.user_id, payload.session_id, payload.samples, payload.events)


@app.get("/dataset/status")
def dataset_status() -> dict:
    status = engine.get_live_dataset_status()
    status["dataset_path"] = str(LIVE_DATA_PATH)
    return status


@app.post("/train-live")
def train_live() -> dict:
    status = engine.get_live_dataset_status()
    if not status["ready_for_training"]:
        raise HTTPException(status_code=400, detail="Not enough live app data collected yet.")
    artifacts = train_from_dataset(str(LIVE_DATA_PATH), epochs=12, batch_size=64, learning_rate=1e-3)
    engine.reload_artifacts()
    return {
        "model_path": artifacts.model_path,
        "scaler_path": artifacts.scaler_path,
        "metrics": artifacts.metrics,
        "mode": engine.mode,
    }


@app.get("/sessions/replay")
def session_replays() -> list[dict]:
    return engine.get_recent_session_replays()
