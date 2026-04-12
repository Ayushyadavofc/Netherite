from __future__ import annotations

import os

import uvicorn

from app.config import DEFAULT_HOST, DEFAULT_PORT
from app.server import app


def main() -> None:
    host = os.environ.get("PRECHAOS_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
    raw_port = os.environ.get("PRECHAOS_PORT", str(DEFAULT_PORT)).strip()
    try:
        port = int(raw_port)
    except ValueError:
        port = DEFAULT_PORT

    uvicorn.run(app, host=host, port=port, log_level=os.environ.get("PRECHAOS_LOG_LEVEL", "info"))


if __name__ == "__main__":
    main()

