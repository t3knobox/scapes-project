"""Single source of 'now' so tests can freeze/advance time deterministically.
Monkeypatch app.clock.now in tests to control job-age / stub-readiness logic."""
import time


def now() -> float:
    """Monotonic seconds. Use for durations, not wall-clock timestamps."""
    return time.monotonic()
