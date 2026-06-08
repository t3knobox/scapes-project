"""Structured JSON logging with correlation fields (jobId / requestId / runpodId).
See RELIABILITY.md §0.2. Idempotent — safe to call on every import."""
import json
import logging
import sys

_CONFIGURED = False


class JsonFormatter(logging.Formatter):
    CORRELATION_KEYS = ("requestId", "jobId", "runpodId", "category")

    def format(self, r: logging.LogRecord) -> str:
        out = {"lvl": r.levelname, "logger": r.name, "msg": r.getMessage()}
        for k in self.CORRELATION_KEYS:
            v = getattr(r, k, None)
            if v is not None:
                out[k] = v
        if r.exc_info:
            out["exc"] = self.formatException(r.exc_info)
        return json.dumps(out)


def setup() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [h]
    root.setLevel(logging.INFO)
    _CONFIGURED = True
