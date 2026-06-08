"""In-memory sliding-window rate limiter (RELIABILITY.md §1).
MVP-grade: per single replica. Swap for a Redis token bucket when you scale out."""
from __future__ import annotations

from collections import deque

from . import clock


class RateLimiter:
    def __init__(self, max_events: int, window_sec: float):
        self.max = max_events
        self.window = window_sec
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = clock.now()
        dq = self._hits.setdefault(key, deque())
        while dq and now - dq[0] > self.window:
            dq.popleft()
        if len(dq) >= self.max:
            return False
        dq.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()
