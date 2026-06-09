"""/jobs polling + lifecycle tests (RELIABILITY.md §2)."""
from app import clock, main, runpod_client


def test_unknown_job_404(client):
    r = client.get("/jobs/does-not-exist")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "NOT_FOUND"


def test_job_completes_with_full_pack(client):
    jid = client.post("/generate", json={"prompt": "ancient forest"}).json()["jobId"]
    s = client.get(f"/jobs/{jid}").json()
    assert s["status"] == "done"
    assert s["clips"] and 8 <= len(s["clips"]) <= 12
    for c in s["clips"]:
        assert c["url"].startswith("https://")
        assert c["category"] in ("bass", "mid", "high", "environmental", "voice", "earcandy", "perc")


def test_job_times_out(client, monkeypatch):
    monkeypatch.setattr(runpod_client, "STUB_DELAY", 10_000)   # never becomes ready
    jid = client.post("/generate", json={"prompt": "slow scene"}).json()["jobId"]
    base = clock.now()
    # Jump the clock past the max job age; stub is still "running".
    monkeypatch.setattr(clock, "now", lambda: base + main.MAX_JOB_SEC + 1)
    s = client.get(f"/jobs/{jid}").json()
    assert s["status"] == "error" and s["error"] == "GEN_TIMEOUT"


def test_transient_runpod_error_keeps_job_running(client, monkeypatch):
    monkeypatch.setattr(runpod_client, "STUB_DELAY", 10_000)
    jid = client.post("/generate", json={"prompt": "x"}).json()["jobId"]

    async def flaky(*a, **k):
        raise RuntimeError("502 from runpod")

    monkeypatch.setattr(runpod_client, "status", flaky)
    s = client.get(f"/jobs/{jid}").json()
    assert s["status"] == "running"   # transient error must NOT fail the job
