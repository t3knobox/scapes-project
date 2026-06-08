# EtherealPad — Backend

FastAPI orchestration layer. Runs **fully standalone** in stub mode — no GPU, no RunPod,
no R2, no API key — so you can develop the frontend and run the whole test suite today.

See [../SPEC.md](../SPEC.md) for architecture and [../RELIABILITY.md](../RELIABILITY.md)
for the guard/log/test rationale behind each endpoint.

## Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                # optional; defaults already work in stub mode
```

## Run

```powershell
uvicorn app.main:app --reload --port 8000
```

Then:
```powershell
# enqueue a generation (stub returns clip metadata instantly)
curl -X POST http://localhost:8000/generate -H "Content-Type: application/json" -d '{\"prompt\":\"misty forest at dawn with chimes\"}'
# poll it (use the jobId from above)
curl http://localhost:8000/jobs/<jobId>
```

`GET /ready` shows whether you're in stub mode (`"stubWorker": true`).

## Test

```powershell
cd backend
pytest                 # all guards, lifecycle, dedupe, timeout, store, sharing, expander
```

The suite runs with no network: the LLM expander falls back to the rules engine
(`ANTHROPIC_API_KEY` is popped in `tests/conftest.py`) and the worker is stubbed.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/generate` | `{prompt, clipCounts?}` → `{jobId, key, bpm, cached}` |
| GET | `/jobs/{id}` | `{status, progress, clips, error, key, bpm}` |
| POST | `/soundscapes` | save a pack (clip URLs validated against `CDN_BASE`) → `{id, slug}` |
| GET | `/s/{slug}` | resolve a shared pack |
| GET | `/health` `/ready` | liveness / readiness |

Error responses are `{"detail": {"code": "..."}}` — see the taxonomy in RELIABILITY.md §0.3.

## Going live (real worker)

1. Set `STUB_WORKER=0`, `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, and R2/`CDN_BASE` in `.env`.
2. Build & deploy the GPU worker image (see SPEC.md §4).
3. (Optional) Set `ANTHROPIC_API_KEY` to enable the LLM prompt expander.
4. Move the in-memory `jobs` store to Redis before running >1 replica (RELIABILITY.md §5).
