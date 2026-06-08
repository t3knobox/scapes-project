"""Test config. Sets STUB/no-key env BEFORE importing the app, then provides a
TestClient and resets all in-memory state between tests."""
import os

# Must be set before `app.main` is imported (it reads these at import time).
os.environ.setdefault("STUB_WORKER", "1")
os.environ.setdefault("STUB_DELAY_SEC", "0")     # stub job completes on first poll
os.environ.setdefault("RATE_MAX", "1000")        # don't trip the limiter in unrelated tests
os.environ.pop("ANTHROPIC_API_KEY", None)        # force the deterministic rules-engine fallback

import pytest
from fastapi.testclient import TestClient

from app import main, runpod_client, store


@pytest.fixture(autouse=True)
def _reset_state():
    store.reset()
    runpod_client.reset()
    main.rate_limiter.reset()
    yield


@pytest.fixture
def client():
    return TestClient(main.app)
