# PreChaos AI

## Backend

1. Create a Python virtual environment.
2. Install dependencies from `prechaos/backend/requirements.txt`.
3. Start the API:

```bash
uvicorn main:app --app-dir prechaos/backend --host 127.0.0.1 --port 8765
```

The Electron main process can also launch it automatically when Python is available.

## Supported endpoints

- `GET /health`
- `POST /predict`
- `POST /feedback`
- `GET /baseline`
- `POST /baseline`
- `POST /train`

## Training data format

Use JSON with one object per interaction sample. Example fields:

```json
[
  {
    "user_id": "demo-user",
    "hold_time": 142,
    "dd_latency": 81,
    "ud_latency": 63,
    "deviation": 14,
    "idle_time": 0.2,
    "mouse_movement_speed": 0.8,
    "tab_switch_frequency": 0.1,
    "session_duration": 11.2,
    "fatigue_score": 0.0
  }
]
```
