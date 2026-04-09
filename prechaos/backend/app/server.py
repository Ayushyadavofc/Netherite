from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Security, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .config import (
    ALLOWED_DATASET_SUFFIXES,
    API_KEY_HEADER_NAME,
    DATA_ROOT,
    FEATURE_NAMES,
    LIVE_DATA_PATH,
    MAX_DATASET_PATH_LENGTH,
    MAX_REQUEST_BYTES,
)
from .engine import PreChaosEngine
from .feature_engineering import FeatureEngineeringError
from .rate_limit import RateLimitExceededError, SlidingWindowRateLimiter
from .security import get_expected_api_key, is_authorized_token, log_suspicious_activity
from .training import train_from_dataset

app = FastAPI(title="PreChaos AI", version="2.1.0")
engine = PreChaosEngine()
rate_limiter = SlidingWindowRateLimiter(max_requests=120, max_events=3_000, window_seconds=60)
api_key_header = APIKeyHeader(name=API_KEY_HEADER_NAME, auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)
get_expected_api_key()

ALLOWED_DATASET_DIR = DATA_ROOT.resolve()

USER_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,64}$"
SESSION_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,128}$"


class StrictPayloadModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


FiniteProbability = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
NonNegativeFinite = Annotated[float, Field(ge=0.0, allow_inf_nan=False)]


class PredictionContextPayload(StrictPayloadModel):
    route: str = Field(default="/", min_length=1, max_length=128)
    page_name: Literal["landing", "notes", "flashcards", "todos", "habits", "analytics", "other"] = "other"
    productive_context: bool = False
    focused_editable: bool = False
    recent_meaningful_actions: NonNegativeFinite = 0.0
    recent_event_density: NonNegativeFinite = 0.0
    route_switches: NonNegativeFinite = 0.0
    route_dwell_seconds: NonNegativeFinite = 0.0
    note_activity: NonNegativeFinite = 0.0
    note_switches: NonNegativeFinite = 0.0
    note_saves: NonNegativeFinite = 0.0
    flashcard_activity: NonNegativeFinite = 0.0
    flashcard_answer_latency: NonNegativeFinite = 0.0
    flashcard_successes: NonNegativeFinite = 0.0
    todo_activity: NonNegativeFinite = 0.0
    todo_completions: NonNegativeFinite = 0.0
    habit_activity: NonNegativeFinite = 0.0
    habit_check_ins: NonNegativeFinite = 0.0
    progress_events: NonNegativeFinite = 0.0
    reading_mode: bool = False
    webcam_opt_in: bool = False


class RawEventPayload(StrictPayloadModel):
    timestamp: int = Field(ge=946684800000, le=4102444800000)
    type: Literal[
        "key_down",
        "mouse_move",
        "route_change",
        "visibility_change",
        "focus",
        "scroll",
        "study_action",
        "webcam_signal",
    ]
    key_class: Optional[Literal["character", "backspace", "delete", "enter", "modifier", "navigation", "other"]] = None
    route: Optional[str] = Field(default=None, min_length=1, max_length=128)
    action: Optional[str] = Field(default=None, min_length=1, max_length=64)
    hidden: Optional[bool] = None
    dx: float = Field(default=0.0, ge=-5_000.0, le=5_000.0, allow_inf_nan=False)
    dy: float = Field(default=0.0, ge=-5_000.0, le=5_000.0, allow_inf_nan=False)
    fatigue_score: Optional[FiniteProbability] = None
    confidence: Optional[FiniteProbability] = None

    @model_validator(mode="after")
    def validate_shape(self) -> "RawEventPayload":
        if self.type == "key_down" and self.key_class is None:
            self.key_class = "character"
        if self.type == "visibility_change" and self.hidden is None:
            raise ValueError("visibility_change events require a boolean hidden flag.")
        if self.type == "route_change" and not self.route:
            raise ValueError("route_change events require a route.")
        if self.type == "study_action" and (not self.route or not self.action):
            raise ValueError("study_action events require both route and action.")
        if self.type == "webcam_signal":
            if self.fatigue_score is None:
                raise ValueError("webcam_signal events require fatigue_score.")
            if self.confidence is None:
                self.confidence = 1.0
        return self


class FeedbackPayload(StrictPayloadModel):
    user_id: str = Field(default="local-user", pattern=USER_ID_PATTERN)
    label: Literal["focused", "thinking", "distracted", "tired"]
    risk: FiniteProbability


class TrainPayload(StrictPayloadModel):
    dataset_path: str = Field(min_length=1, max_length=MAX_DATASET_PATH_LENGTH)
    epochs: int = Field(default=24, ge=1, le=100)
    batch_size: int = Field(default=32, ge=1, le=256)
    learning_rate: float = Field(default=1e-3, gt=0, allow_inf_nan=False)

    @field_validator("dataset_path")
    @classmethod
    def validate_dataset_path(cls, value: str) -> str:
        normalized = value.strip()
        if any(char in normalized for char in ("\x00", "\r", "\n")):
            raise ValueError("dataset_path contains invalid control characters.")
        if Path(normalized).suffix.lower() not in ALLOWED_DATASET_SUFFIXES:
            raise ValueError(f"dataset_path must end in one of: {', '.join(sorted(ALLOWED_DATASET_SUFFIXES))}.")

        # Directory boundary check to prevent path traversal
        resolved_path = Path(normalized).resolve()
        if not str(resolved_path).startswith(str(ALLOWED_DATASET_DIR)):
            raise ValueError("Dataset path must be within the allowed data directory.")

        return normalized


class EventBatchPayload(StrictPayloadModel):
    user_id: str = Field(default="local-user", pattern=USER_ID_PATTERN)
    session_id: str = Field(pattern=SESSION_ID_PATTERN)
    session_started_at: Optional[int] = Field(default=None, ge=946684800000, le=4102444800000)
    events: list[RawEventPayload] = Field(min_length=1, max_length=240)


class CollectPayload(EventBatchPayload):
    write_to_dataset: bool = Field(default=True)
    predict: bool = Field(default=True)
    request_id: Optional[str] = Field(default=None)


class PredictPayload(EventBatchPayload):
    context: Optional[PredictionContextPayload] = None


class BaselinePayload(EventBatchPayload):
    pass


def _client_host(request: Request) -> str:
    return request.client.host if request.client else "local"


async def _security_middleware(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                log_suspicious_activity(
                    "oversized_payload_rejected",
                    route=request.url.path,
                    method=request.method,
                    client=_client_host(request),
                    content_length=content_length,
                )
                return JSONResponse(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, content={"detail": "Request payload too large."})
        except ValueError:
            log_suspicious_activity(
                "invalid_content_length_header",
                route=request.url.path,
                method=request.method,
                client=_client_host(request),
            )
            return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": "Invalid Content-Length header."})

    body = await request.body()
    if len(body) > MAX_REQUEST_BYTES:
        log_suspicious_activity(
            "oversized_payload_rejected",
            route=request.url.path,
            method=request.method,
            client=_client_host(request),
            body_size=len(body),
        )
        return JSONResponse(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, content={"detail": "Request payload too large."})

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    response = await call_next(Request(request.scope, receive))
    return response


app.middleware("http")(_security_middleware)


def require_authenticated_request(
    request: Request,
    header_key: str | None = Security(api_key_header),
    bearer: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
) -> None:
    token = header_key or (bearer.credentials if bearer else None)
    if not is_authorized_token(token):
        log_suspicious_activity(
            "authentication_failed",
            route=request.url.path,
            method=request.method,
            client=_client_host(request),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized.",
            headers={"WWW-Authenticate": "Bearer"},
        )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    sanitized_errors = [
        {"loc": error.get("loc"), "msg": error.get("msg"), "type": error.get("type")}
        for error in exc.errors()
    ]
    log_suspicious_activity(
        "request_validation_failed",
        route=request.url.path,
        method=request.method,
        client=_client_host(request),
        error_count=len(sanitized_errors),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Request validation failed.", "errors": sanitized_errors},
    )


@app.exception_handler(FeatureEngineeringError)
async def feature_engineering_exception_handler(request: Request, exc: FeatureEngineeringError) -> JSONResponse:
    log_suspicious_activity(
        "feature_engineering_rejected",
        route=request.url.path,
        method=request.method,
        client=_client_host(request),
        reason=str(exc),
    )
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)})


@app.exception_handler(RateLimitExceededError)
async def rate_limit_exception_handler(request: Request, exc: RateLimitExceededError) -> JSONResponse:
    log_suspicious_activity(
        "rate_limit_triggered",
        route=request.url.path,
        method=request.method,
        client=_client_host(request),
    )
    return JSONResponse(status_code=status.HTTP_429_TOO_MANY_REQUESTS, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def value_error_exception_handler(request: Request, exc: ValueError) -> JSONResponse:
    log_suspicious_activity(
        "value_error_rejected",
        route=request.url.path,
        method=request.method,
        client=_client_host(request),
        reason=str(exc),
    )
    return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log_suspicious_activity(
        "unhandled_server_exception",
        route=request.url.path,
        method=request.method,
        client=_client_host(request),
        exception_type=type(exc).__name__,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "PreChaos encountered an unexpected server error."},
    )


def _rate_limit(request: Request, user_id: str, session_id: str, event_count: int) -> None:
    rate_limiter.check(f"{_client_host(request)}:{user_id}:{session_id}", event_count=event_count)


@app.get("/health")
def healthcheck() -> dict:
    return {
        "ok": True,
        "version": app.version,
        "feature_count": len(FEATURE_NAMES),
        "auth_required": True,
    }


@app.post("/predict")
def predict(payload: PredictPayload, request: Request, _auth: None = Depends(require_authenticated_request)) -> dict:
    _rate_limit(request, payload.user_id, payload.session_id, len(payload.events))
    result = engine.predict_from_events(
        user_id=payload.user_id,
        session_id=payload.session_id,
        events=[event.model_dump() for event in payload.events],
        session_started_at=payload.session_started_at,
        context=payload.context.model_dump() if payload.context else None,
        persist_prediction=False,
    )
    return result.__dict__


@app.post("/feedback")
def feedback(payload: FeedbackPayload, request: Request, _auth: None = Depends(require_authenticated_request)) -> dict:
    return engine.submit_feedback(payload.user_id, payload.label, payload.risk)


@app.get("/baseline")
def get_baseline(
    request: Request,
    _auth: None = Depends(require_authenticated_request),
    user_id: Optional[str] = Query(default=None, pattern=USER_ID_PATTERN),
) -> dict:
    return engine.get_baseline(user_id)


@app.post("/baseline")
def update_baseline(payload: BaselinePayload, request: Request, _auth: None = Depends(require_authenticated_request)) -> dict:
    _rate_limit(request, payload.user_id, payload.session_id, len(payload.events))
    return engine.update_baseline_from_events(
        payload.user_id,
        payload.session_id,
        [event.model_dump() for event in payload.events],
        session_started_at=payload.session_started_at,
    )


@app.post("/train")
def train(payload: TrainPayload, request: Request, _auth: None = Depends(require_authenticated_request)) -> dict:
    artifacts = train_from_dataset(
        payload.dataset_path,
        epochs=payload.epochs,
        batch_size=payload.batch_size,
        learning_rate=payload.learning_rate,
    )
    engine.refresh_session_authority_cache()
    return {
        "ok": True,
        "model_type": artifacts.metrics.get("model", "unknown"),
        "metrics": artifacts.metrics,
    }


@app.post("/collect")
def collect(payload: CollectPayload, request: Request, _auth: None = Depends(require_authenticated_request)) -> dict:
    _rate_limit(request, payload.user_id, payload.session_id, len(payload.events))
    return engine.collect_raw_events(
        payload.user_id,
        payload.session_id,
        [event.model_dump() for event in payload.events],
        session_started_at=payload.session_started_at,
        write_to_dataset=payload.write_to_dataset,
        predict=payload.predict,
        request_id=payload.request_id,
    )


@app.get("/dataset/status")
def dataset_status(request: Request, _auth: None = Depends(require_authenticated_request)) -> dict:
    return engine.get_live_dataset_status()


@app.post("/train-live")
def train_live(request: Request, _auth: None = Depends(require_authenticated_request)) -> dict:
    status_payload = engine.get_live_dataset_status()
    if not status_payload["ready_for_training"]:
        raise HTTPException(status_code=400, detail="Not enough live app data collected yet.")
    artifacts = train_from_dataset(str(LIVE_DATA_PATH), epochs=12, batch_size=64, learning_rate=1e-3)
    engine.reload_artifacts()
    engine.refresh_session_authority_cache()
    return {
        "ok": True,
        "model_type": artifacts.metrics.get("model", "unknown"),
        "metrics": artifacts.metrics,
        "mode": engine.mode,
    }


@app.get("/sessions/replay")
def session_replays(request: Request, _auth: None = Depends(require_authenticated_request)) -> list[dict]:
    return engine.get_recent_session_replays()


@app.get("/daily-rhythm")
def daily_rhythm(
    request: Request,
    _auth: None = Depends(require_authenticated_request),
    user_id: Optional[str] = Query(default=None, pattern=USER_ID_PATTERN),
) -> dict:
    return engine.get_daily_rhythm(user_id)
