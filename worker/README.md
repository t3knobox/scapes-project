# The Scapes Project — Audio Worker (RunPod Serverless)

Generates the ear-candy audio clips (textures, leads, perc, vocals) from per-category
prompts. The chordal backbone is the client-side synth HarmonyEngine — this worker is the
*character*. Model-pluggable via the `ENGINE` env var.

- **MusicGen (default)** — open, no token, easy. `ENGINE=musicgen`.
- **Stable Audio Open** — best for ambient; gated (needs `HF_TOKEN`). `ENGINE=stable_audio` (enable in `engines/stable_audio.py`).
- **ACE-Step** — open, melodic. `ENGINE=ace_step` (enable in `engines/ace_step.py`).

## I/O contract
**Input** (`{"input": {...}}`): `subprompts[]` (each `{category, index, durationSec, quantize, loop, positive}`), `key`, `bpm`.
**Output**: `{ "clips": [{ id, category, url, durationSec, quantize, loop, key, bpm }] }`
where `url` is a base64 `data:audio/mpeg` URI — the browser plays it directly, so **no R2/CDN
needed for MVP**. (Swap to R2 + real URLs when clips get long or traffic grows.)

## Deploy on RunPod (GitHub route — no local Docker needed)
1. **Push this repo to GitHub** (the whole project is fine; the worker lives in `worker/`).
2. RunPod → **Serverless → New Endpoint → Import from GitHub** → pick the repo + branch.
3. Set **Dockerfile Path** = `worker/Dockerfile`. (RunPod builds from the repo root; the
   Dockerfile's `COPY worker/...` paths are written for that — don't change them.)
4. **GPU**: a 24GB card (RTX 4090 / A5000 / L4). **Min workers 0** (scale-to-zero),
   **Max 1–2**, **Idle timeout 5–10s**, **FlashBoot ON**.
5. **Env vars** (optional): `ENGINE=musicgen` (default), `MUSICGEN_MODEL=facebook/musicgen-medium`
   (use `facebook/musicgen-small` for faster/cheaper, lower quality).
6. Click deploy. The first build bakes the weights into the image (~10–20 min, one time).
7. **Test** in the RunPod UI with `worker/test_input.json` — you should get 3 clips back.
8. Copy the **Endpoint ID** → into `backend/.env`:
   ```
   STUB_WORKER=0
   RUNPOD_ENDPOINT_ID=<your endpoint id>
   ```
   (Your `RUNPOD_API_KEY` is already set.)

## Local Docker route (alternative)
```bash
# build from the REPO ROOT (context = root), pointing at the worker Dockerfile
docker build -f worker/Dockerfile -t scapes-worker .
docker push <your-registry>/scapes-worker   # then point the RunPod endpoint at the image
```

## Cost / timing notes
- musicgen-medium generates ~1–3× realtime on a 4090; a full ~9-clip pack ≈ 40–120s of GPU
  (plus cold start on the first request after idle). Weights are baked in to keep cold starts short.
- Scale-to-zero → you pay only while a pack renders. ~a few cents per generation at this tier.
