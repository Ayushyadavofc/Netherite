from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimitExceededError(RuntimeError):
    """Raised when a client exceeds the local abuse-protection budget."""


class SlidingWindowRateLimiter:
    """
    Lightweight in-memory abuse protection for a local sidecar.

    This is intentionally simple:
    - caps request bursts per identity
    - caps raw event volume per identity
    - avoids adding external infrastructure for a local-first app
    """

    def __init__(self, *, max_requests: int, max_events: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[tuple[float, int]]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, identifier: str, *, event_count: int) -> None:
        now = time.monotonic()
        with self._lock:
            bucket = self._requests[identifier]
            cutoff = now - self.window_seconds
            while bucket and bucket[0][0] < cutoff:
                bucket.popleft()

            request_count = len(bucket)
            recent_events = sum(cost for _, cost in bucket)
            if request_count >= self.max_requests or recent_events + event_count > self.max_events:
                raise RateLimitExceededError(
                    "Too many event batches were submitted. Please slow down and try again shortly."
                )

            bucket.append((now, event_count))
