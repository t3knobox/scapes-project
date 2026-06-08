"""EtherealPad FastAPI app — generation orchestration with the RELIABILITY.md guards.

Endpoints: /generate, /jobs/{id}, /soundscapes, /s/{slug}, /health, /ready.
Runs end-to-end with zero external services in STUB mode (see runpod_client).

  cd backend && uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config  # noqa: F401  -- MUST be first: loads .env before anything reads it
from . import clock, runpod_client, store
from .expander_llm import expand_prompt_llm
from .logging_setup import setup as setup_logging
from .ratelimit import RateLimiter

setup_logging()
log = logging.getLogger("etherealpad.api")

MAX_JOB_SEC = float(os.environ.get("MAX_JOB_SEC", "180"))     # module attr → tests monkeypatch
CDN_BASE = os.environ.get("CDN_BASE", "https://cdn.etherealpad.test")
rate_limiter = RateLimiter(
    int(os.environ.get("RATE_MAX", "5")),
    float(os.environ.get("RATE_WINDOW_SEC", "60")),
)

app = FastAPI(title="EtherealPad API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_ORIGIN", "*")],
    allow_methods=["*"], allow_headers=["*"],
)


# ---- helpers ---------------------------------------------------------------
def _err(status: int, code: str, **extra):
    raise HTTPException(status, {"code": code, **extra})


def _client_key(req: Request) -> str:
    sess = req.headers.get("x-session-id")
    return sess or (req.client.host if req.client else "anon")


def _request_hash(prompt: str, counts: dict | None) -> str:
    payload = json.dumps({"p": prompt.strip().lower(), "c": counts or {}}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _public_job(job_id: str, job: dict) -> dict:
    return {
        "jobId": job_id, "status": job["status"], "progress": job["progress"],
        "clips": job["clips"], "error": job["error"],
        "key": job["key"], "bpm": job["bpm"],
    }


# ---- schemas ---------------------------------------------------------------
class GenerateReq(BaseModel):
    prompt: str
    clipCounts: dict | None = None


class SavePack(BaseModel):
    prompt: str
    key: str
    bpm: int
    clips: list[dict]


class BgReq(BaseModel):
    prompt: str


IMG_STYLE = ("ethereal dreamy atmospheric digital painting, soft volumetric light, "
             "cinematic, high detail, no text")


# ---- health ----------------------------------------------------------------
@app.get("/health")
async def health():
    return {"ok": True}


@app.get("/ready")
async def ready():
    return {"ready": True, "stubWorker": runpod_client._stub_enabled()}


# ---- generation ------------------------------------------------------------
@app.post("/generate")
async def generate(req: GenerateReq, request: Request):
    rid = uuid.uuid4().hex[:8]
    if not req.prompt.strip():
        _err(400, "PROMPT_EMPTY")
    if len(req.prompt) > 400:
        _err(400, "PROMPT_TOO_LONG")
    if not rate_limiter.allow(_client_key(request)):
        log.info("gen.rate_limited", extra={"requestId": rid})
        _err(429, "RATE_LIMITED")

    h = _request_hash(req.prompt, req.clipCounts)
    cached = store.find_done_job_by_hash(h)
    if cached:
        job = store.jobs[cached]
        log.info("gen.cache_hit", extra={"requestId": rid, "jobId": cached})
        return {"jobId": cached, "key": job["key"], "bpm": job["bpm"], "cached": True}

    plan = expand_prompt_llm(req.prompt, request_id=rid)   # never raises (falls back)
    job_id = uuid.uuid4().hex
    store.jobs[job_id] = {
        "status": "queued", "progress": 0, "clips": None,
        "key": plan["key"], "bpm": plan["bpm"],
        "hash": h, "enqueuedAt": clock.now(), "error": None, "runpodId": None,
    }
    try:
        runpod_id = await runpod_client.enqueue(job_id, plan)
    except Exception:
        store.jobs[job_id].update(status="error", error="GEN_FAILED")
        log.exception("gen.runpod_enqueue_failed", extra={"requestId": rid, "jobId": job_id})
        _err(502, "GEN_FAILED", jobId=job_id)

    store.jobs[job_id].update(status="running", runpodId=runpod_id)
    log.info("gen.enqueued", extra={"requestId": rid, "jobId": job_id, "runpodId": runpod_id})
    return {"jobId": job_id, "key": plan["key"], "bpm": plan["bpm"], "cached": False}


@app.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = store.jobs.get(job_id)
    if not job:
        _err(404, "NOT_FOUND")
    if job["status"] in ("done", "error"):
        return _public_job(job_id, job)

    try:
        st = await runpod_client.status(job["runpodId"])
    except Exception:
        log.warning("jobs.runpod_transient", extra={"jobId": job_id})
        return _public_job(job_id, job)   # transient — keep it running, don't fail

    if st["state"] == "done":
        clips = st.get("clips") or []
        if not clips:
            # Worker returned no clips (e.g. a poisoned GPU) — treat as failure, DON'T cache,
            # so the user sees an error and a retry hits a fresh job (and worker).
            job.update(status="error", error="GEN_FAILED")
            log.warning("jobs.empty_result", extra={"jobId": job_id})
        else:
            job.update(status="done", progress=100, clips=clips)
            store.mark_done_hash(job["hash"], job_id)
            log.info("jobs.done clips=%d", len(clips), extra={"jobId": job_id})
    elif st["state"] == "error":
        job.update(status="error", error="GEN_FAILED")
        log.warning("jobs.failed", extra={"jobId": job_id})
    else:
        job["progress"] = st.get("progress", job["progress"])
        if clock.now() - job["enqueuedAt"] > MAX_JOB_SEC:
            job.update(status="error", error="GEN_TIMEOUT")
            log.warning("jobs.timeout", extra={"jobId": job_id})
    return _public_job(job_id, job)


# ---- persistence / sharing -------------------------------------------------
@app.post("/soundscapes")
async def save(pack: SavePack):
    for clip in pack.clips:
        url = clip.get("url", "")
        if not url.startswith(CDN_BASE):
            log.warning("save.reject_foreign_url url=%s", url)
            _err(400, "INVALID_CLIP_URL")
    return store.save_pack(pack.model_dump())


@app.get("/s/{slug}")
async def shared(slug: str):
    pack = store.get_pack_by_slug(slug)
    if not pack:
        _err(404, "NOT_FOUND")
    return pack


# ---- prompt-painted background (Z-Image-Turbo) ----
@app.post("/background")
async def background(req: BgReq):
    if not req.prompt.strip():
        _err(400, "PROMPT_EMPTY")
    styled = f"{req.prompt.strip()[:300]}, {IMG_STYLE}"
    try:
        url = await runpod_client.generate_image(styled)
    except Exception:
        log.exception("background.failed")
        return {"url": None}  # frontend keeps the procedural mesh
    return {"url": url}
