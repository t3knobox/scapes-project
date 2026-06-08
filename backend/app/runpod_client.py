"""RunPod Serverless client with a built-in STUB worker.

STUB mode (default, or whenever RUNPOD_API_KEY is unset) lets you run the whole
backend — and the full test suite — with no GPU, no RunPod account, no R2. It
fabricates clip metadata from the expanded plan and reports the job done after
STUB_DELAY_SEC. Flip to the real worker by setting RUNPOD_API_KEY + RUNPOD_ENDPOINT_ID
and STUB_WORKER=0.

state values returned by status(): "running" | "done" | "error".
"""
from __future__ import annotations

import logging
import os
import uuid

import httpx

from . import clock

log = logging.getLogger("etherealpad.runpod")

STUB_DELAY = float(os.environ.get("STUB_DELAY_SEC", "0"))   # module attr → tests monkeypatch
CDN_BASE = os.environ.get("CDN_BASE", "https://cdn.etherealpad.test")
_RP_ENDPOINT = os.environ.get("RUNPOD_ENDPOINT_ID", "")
_RP_KEY = os.environ.get("RUNPOD_API_KEY", "")
_RP_BASE = f"https://api.runpod.ai/v2/{_RP_ENDPOINT}"

_stub_jobs: dict[str, dict] = {}   # runpod_id -> {ready_at, clips}


def _stub_enabled() -> bool:
    return os.environ.get("STUB_WORKER", "1") == "1" or not _RP_KEY


def reset() -> None:
    _stub_jobs.clear()


def _stub_clips(job_id: str, plan: dict) -> list[dict]:
    clips = []
    for sp in plan["subprompts"]:
        cat, i = sp["category"], sp["index"]
        ext = "wav" if sp.get("loop") else "mp3"   # loops stay WAV (MP3 padding breaks loops)
        clips.append({
            "id": f"{cat}_{i}",
            "category": cat,
            "url": f"{CDN_BASE}/packs/{job_id}/{cat}_{i}.{ext}",
            "durationSec": sp["durationSec"],
            "quantize": sp["quantize"],
            "loop": sp["loop"],
            "key": plan["key"],
            "bpm": plan["bpm"],
        })
    return clips


async def enqueue(job_id: str, plan: dict) -> str:
    if _stub_enabled():
        rid = "stub_" + uuid.uuid4().hex[:8]
        _stub_jobs[rid] = {"ready_at": clock.now() + STUB_DELAY,
                           "clips": _stub_clips(job_id, plan)}
        log.info("runpod.stub_enqueue", extra={"jobId": job_id, "runpodId": rid})
        return rid

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{_RP_BASE}/run",
            headers={"Authorization": _RP_KEY},
            json={"input": {"job_id": job_id, "subprompts": plan["subprompts"],
                            "key": plan["key"], "bpm": plan["bpm"]}},
        )
    r.raise_for_status()
    return r.json()["id"]


async def status(runpod_id: str) -> dict:
    if _stub_enabled() or runpod_id.startswith("stub_"):
        j = _stub_jobs.get(runpod_id)
        if not j:
            return {"state": "error", "error": "unknown stub job"}
        if clock.now() >= j["ready_at"]:
            return {"state": "done", "progress": 100, "clips": j["clips"]}
        return {"state": "running", "progress": 50}

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{_RP_BASE}/status/{runpod_id}",
                        headers={"Authorization": _RP_KEY})
    r.raise_for_status()
    data = r.json()
    rp = data.get("status")
    if rp == "COMPLETED":
        return {"state": "done", "progress": 100, "clips": data["output"]["clips"]}
    if rp == "FAILED":
        return {"state": "error", "error": data.get("error", "generation failed")}
    return {"state": "running", "progress": data.get("output", {}).get("progress", 0)}
