"""/generate guard tests (RELIABILITY.md §1)."""
from app import main, runpod_client
from app.ratelimit import RateLimiter


def test_rejects_empty(client):
    r = client.post("/generate", json={"prompt": "   "})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "PROMPT_EMPTY"


def test_rejects_too_long(client):
    r = client.post("/generate", json={"prompt": "x" * 401})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "PROMPT_TOO_LONG"


def test_happy_path_enqueues(client):
    r = client.post("/generate", json={"prompt": "misty forest at dawn"})
    assert r.status_code == 200
    body = r.json()
    assert body["jobId"] and body["cached"] is False
    assert 55 <= body["bpm"] <= 90


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(main, "rate_limiter", RateLimiter(2, 60))
    assert client.post("/generate", json={"prompt": "a"}).status_code == 200
    assert client.post("/generate", json={"prompt": "b"}).status_code == 200
    r = client.post("/generate", json={"prompt": "c"})
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "RATE_LIMITED"


def test_dedupes_identical_prompt(client):
    j1 = client.post("/generate", json={"prompt": "same scene"}).json()["jobId"]
    # STUB_DELAY=0 → first poll completes the job and indexes its hash
    assert client.get(f"/jobs/{j1}").json()["status"] == "done"
    r2 = client.post("/generate", json={"prompt": "same scene"}).json()
    assert r2["jobId"] == j1 and r2["cached"] is True


def test_enqueue_failure_returns_gen_failed(client, monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("runpod down")

    monkeypatch.setattr(runpod_client, "enqueue", boom)
    r = client.post("/generate", json={"prompt": "x"})
    assert r.status_code == 502
    assert r.json()["detail"]["code"] == "GEN_FAILED"
