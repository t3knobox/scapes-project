# EtherealPad — Dev Spec

> An interactive generative ambient soundscape creator. The user describes a world in
> text; the app generates 8–12 categorized audio clips and loads them into a **smart
> drum-pad**. Press play and an ambience loop evolves on its own; tap any other pad and
> the clip is queued, auto-processed with effects, and blended into the mix so it always
> sounds intentional.

---

## 0. Locked Decisions (from scoping)

| Area | Decision |
|---|---|
| **Generation flow** | Live per-prompt, **async queue** (submit → job → poll → clips load into pads) |
| **Primary model** | **Stable Audio Open** (ambient/textural strength). ACE-Step kept as a pluggable fallback if quality disappoints |
| **GPU host** | **RunPod Serverless** (scale-to-zero, pay-per-second) |
| **Stack** | **Next.js** (frontend, Tailwind, Tone.js) + **FastAPI** (Python orchestration) |
| **Trigger timing** | **Hybrid per-category** — ambience/textures free-floating crossfades; percussion/chimes/leads soft-quantized to a slow grid |
| **Effects** | **Fully automatic** black-box FX per clip (no user knobs in MVP) |
| **Persistence** | **Save + public share links** → Postgres + auth + object storage + CDN + share pages |

---

## 1. High-Level Architecture

```
                              ┌─────────────────────────────────────────────┐
                              │                BROWSER (Next.js)             │
                              │                                              │
   prompt ───────────────────┤  PromptBar → POST /generate                  │
                              │                  │                           │
                              │                  ▼  jobId                    │
                              │  useGeneration() polls GET /jobs/{id} ◄──────┼──┐
                              │                  │ status=done, clips[]      │  │
                              │                  ▼                           │  │
                              │  Tone.js engine (client-side, no server) ─── │  │
                              │   • AmbienceLoop (auto-modulating)           │  │
                              │   • PadGrid (smart queue + auto-FX)          │  │
                              │   • Keyboard → pads (low latency)            │  │
                              │   • AutoMode scheduler                       │  │
                              └──────────────────┬───────────────────────────┘  │
                                                 │ audio file URLs               │
                                                 ▼                               │
                              ┌──────────────────────────────────────────┐      │
                              │   Object Storage + CDN (Cloudflare R2)    │      │
                              │   serves .wav/.mp3 clips                   │      │
                              └──────────────────────────────────────────┘      │
                                                 ▲                               │
   ┌─────────────────────────────────────────────┼───────────────────────────────┘
   │            BACKEND (FastAPI, always-on tiny box — Fly.io / Render)
   │
   │  POST /generate          → parse prompt → build per-category model prompts
   │                            → enqueue job → call RunPod Serverless /run (async)
   │  GET  /jobs/{id}          → poll RunPod status; on done, copy clips → R2 → return URLs
   │  POST /soundscapes        → save pack (DB)            } persistence /
   │  GET  /s/{slug}           → fetch shared pack (DB)     } share layer
   │
   │  Postgres (Supabase): users, soundscapes, clips, share_slugs
   │
   └──────────────► RunPod Serverless GPU worker (scale-to-zero)
                    • loads Stable Audio Open (or ACE-Step)
                    • generates N clips from category prompts
                    • uploads to R2, returns clip metadata
```

### Data flow (happy path)

1. User types a prompt, hits Generate.
2. Frontend `POST /generate` → backend creates a `job` row, expands the prompt into
   8–12 **category-specific** model prompts (§2), fires a single RunPod **async** job
   carrying all sub-prompts, returns `{ jobId }` immediately.
3. RunPod cold-starts (or reuses a warm worker), loads the model once, loops over the
   sub-prompts, uploads each rendered clip to R2, returns clip metadata.
4. Frontend polls `GET /jobs/{jobId}` every ~2s. On `done`, it receives clip URLs +
   category + suggested loop points and **lazy-loads** them into Tone.js buffers.
5. Ambience auto-starts (or waits for Play); other clips become tappable pads.
6. User optionally saves → `POST /soundscapes` → gets a `/s/{slug}` share link.

### Why this shape
- **All audio runtime is client-side.** After clips load, zero server cost while the
  user plays for an hour. The GPU only runs during the ~30–90s generation burst.
- **Async job model** absorbs RunPod cold starts (a few seconds to ~30s) without
  holding an HTTP connection open.
- **Tiny always-on backend** (256–512MB box) just orchestrates; it is cheap and never
  touches a GPU.

---

## 2. Prompt Engineering Guide

Stable Audio Open responds to **dense, comma-separated descriptors** (genre, mood,
instrument, texture, BPM, key) rather than conversational sentences. We expand the
user's single prompt into one tuned sub-prompt per clip category.

### 2.1 Category matrix (8–12 clips)

| Category | Count | Length | Quantize? | Prompt skeleton |
|---|---|---|---|---|
| `ambience` | 1 | 45–60s | free | `{scene}, evolving ambient drone, lush pad, deep reverb, seamless loop, no percussion, no melody, slow swelling texture, stereo wide, {key}, 60 bpm` |
| `texture` | 2 | 20–40s | free | `{scene}, granular atmospheric texture, airy noise, field-recording shimmer, no rhythm, ethereal, {key}` |
| `lead` | 2 | 8–16s | soft | `{scene}, soft ethereal synth lead motif, glassy bell-like, sparse melodic phrase, dreamy, reverb tail, {key}, {bpm} bpm` |
| `bass` | 1 | 8–16s | soft | `{scene}, deep warm sub bass drone, smooth sine, minimal movement, {key}, {bpm} bpm` |
| `perc` | 2 | 4–8s | soft | `{scene}, delicate percussion, glass chimes, wooden clicks, hand bells, sparse, airy, {bpm} bpm` |
| `vocal` | 1–2 | 6–12s | soft | `{scene}, wordless ethereal vocal pad, breathy choir aah, distant airy whisper texture, no lyrics, reverb` |

`{scene}` = lightly cleaned user prompt. `{key}` and `{bpm}` are chosen once per pack
(see §2.3) so everything is musically compatible.

### 2.2 System / construction prompt (backend-side expander)

**Two-tier expander (decided):** the **primary** path is an **LLM expander** (Claude,
structured output) that intelligently *routes* scene elements to the right category
(chimes→perc, whispers→vocal, drones→ambience) and picks one coherent key+BPM. The
**fallback** is a deterministic rules engine, used on any LLM failure so generation never
hard-fails. Both emit the identical pack contract. See
[backend/app/expander_llm.py](backend/app/expander_llm.py) (primary),
[backend/app/prompts.py](backend/app/prompts.py) (fallback), and
[backend/tests/test_expander.py](backend/tests/test_expander.py).

The rules engine alone is still a valid zero-cost MVP if you skip the LLM:

```
GLOBAL POSITIVE (appended to every sub-prompt):
  "ethereal, peaceful, dreamy, high quality, clean, professional, stereo"

GLOBAL NEGATIVE (Stable Audio supports negative prompts):
  "harsh, distorted, aggressive, lo-fi, noisy clipping, spoken words, lyrics,
   vocals singing words, drums beat heavy, club, EDM drop"

LOOP RULE (ambience/texture only):
  append "seamless loop, no fade in, no fade out, continuous"
```

> **If you later swap to an LLM expander:** system prompt = *"You convert a user's
> scene description into N comma-separated audio-model prompts, one per category in the
> provided list. Each prompt is descriptive keywords only — instruments, textures,
> mood, key, bpm. Never write full sentences or lyrics. Keep ambience melody-free and
> percussion-free. Output strict JSON: `{category: prompt}`."*

### 2.3 Musical coherence
- Pick one **key** (e.g. random from `[C, D, E, A]` major/lydian for "floaty") and one
  **bpm** (60–80) per pack. Inject into every sub-prompt so leads/bass/perc are
  harmonically and rhythmically compatible.
- Persist `key` + `bpm` in the pack metadata → the frontend sets `Tone.Transport.bpm`
  for the soft-quantized categories.

### 2.4 Loop seamlessness
Models rarely emit perfectly seamless loops. Backend post-processing per ambience/texture clip:
1. Render slightly longer than needed (e.g. 50s for a 45s loop).
2. Detect a low-RMS zero-crossing near start and end; trim to the nearest matching points.
3. Apply a short (50–150ms) **equal-power crossfade** of the tail onto the head, write
   the looped-ready file, and store `loopStart`/`loopEnd` seconds in metadata.
   (Tone.js will also crossfade at runtime — belt and suspenders.)

---

## 3. Backend API (FastAPI)

### 3.1 Endpoints

| Method | Path | Body / Params | Returns |
|---|---|---|---|
| `POST` | `/generate` | `{ prompt: str, clipCounts?: {...} }` | `{ jobId, key, bpm }` |
| `GET` | `/jobs/{jobId}` | — | `{ status, progress, clips[]? , error? }` |
| `POST` | `/soundscapes` | `{ prompt, key, bpm, clips[] }` (+ auth) | `{ id, slug }` |
| `GET` | `/soundscapes/{id}` | — | full pack |
| `GET` | `/s/{slug}` | — | public pack for share page |
| `GET` | `/health` | — | `{ ok: true }` |

**Clip object** returned to the client:
```json
{
  "id": "clip_abc",
  "category": "lead",
  "url": "https://cdn.etherealpad.app/packs/xyz/lead_1.mp3",
  "durationSec": 12.4,
  "loopStart": null,
  "loopEnd": null,
  "key": "D",
  "bpm": 72,
  "quantize": "soft"
}
```

**Job status enum:** `queued | running | uploading | done | error`.

### 3.2 Skeleton (`backend/app/main.py`)

```python
import os, uuid, asyncio, httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .expander_llm import expand_prompt_llm as expand_prompt   # §2 LLM primary + rules fallback
from .store import jobs, save_pack, get_pack_by_slug  # in-mem or Redis + Postgres

RUNPOD_ENDPOINT = os.environ["RUNPOD_ENDPOINT_ID"]
RUNPOD_KEY = os.environ["RUNPOD_API_KEY"]
RUNPOD_BASE = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT}"

app = FastAPI(title="EtherealPad API")
app.add_middleware(
    CORSMiddleware, allow_origins=[os.environ["FRONTEND_ORIGIN"]],
    allow_methods=["*"], allow_headers=["*"],
)

class GenerateReq(BaseModel):
    prompt: str
    clipCounts: dict | None = None

@app.post("/generate")
async def generate(req: GenerateReq):
    if not req.prompt.strip():
        raise HTTPException(400, "empty prompt")
    job_id = uuid.uuid4().hex
    plan = expand_prompt(req.prompt, req.clipCounts)   # -> {key, bpm, subprompts:[...]}
    jobs[job_id] = {"status": "queued", "progress": 0, "clips": None,
                    "key": plan["key"], "bpm": plan["bpm"]}

    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{RUNPOD_BASE}/run",
            headers={"Authorization": RUNPOD_KEY},
            json={"input": {"job_id": job_id, "subprompts": plan["subprompts"],
                            "key": plan["key"], "bpm": plan["bpm"]}})
    r.raise_for_status()
    jobs[job_id]["runpod_id"] = r.json()["id"]
    jobs[job_id]["status"] = "running"
    return {"jobId": job_id, "key": plan["key"], "bpm": plan["bpm"]}

@app.get("/jobs/{job_id}")
async def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "unknown job")
    if job["status"] in ("done", "error"):
        return job
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{RUNPOD_BASE}/status/{job['runpod_id']}",
                        headers={"Authorization": RUNPOD_KEY})
    data = r.json()
    rp = data.get("status")
    if rp == "COMPLETED":
        out = data["output"]                  # worker already uploaded to R2
        job.update(status="done", progress=100, clips=out["clips"])
    elif rp == "FAILED":
        job.update(status="error", error=data.get("error", "generation failed"))
    else:
        job["progress"] = data.get("output", {}).get("progress", job["progress"])
    return job

class SavePack(BaseModel):
    prompt: str; key: str; bpm: int; clips: list[dict]

@app.post("/soundscapes")
async def save(pack: SavePack):
    return save_pack(pack.model_dump())       # -> {id, slug}

@app.get("/s/{slug}")
async def shared(slug: str):
    pack = get_pack_by_slug(slug)
    if not pack:
        raise HTTPException(404)
    return pack

@app.get("/health")
async def health(): return {"ok": True}
```

> **State store:** for MVP, `jobs` can be an in-process dict. The moment you run >1
> backend replica, move it to **Redis** (Upstash free tier) so `/generate` and
> `/jobs` agree. Packs go straight to Postgres (Supabase).

### 3.3 Prompt expander — rules-engine **fallback** (`backend/app/prompts.py`, abridged)

> The LLM primary lives in [backend/app/expander_llm.py](backend/app/expander_llm.py) and
> calls this on any failure. Both return the identical pack dict.

```python
import random

KEYS = ["C", "D", "E", "A"]
GLOBAL_POS = "ethereal, peaceful, dreamy, high quality, clean, stereo"
GLOBAL_NEG = ("harsh, distorted, aggressive, lo-fi, clipping, spoken words, "
              "lyrics, singing words, heavy drums, EDM, club")

TEMPLATES = {  # category: (count, dur, quantize, template)
  "ambience": (1, 55, "free", "{s}, evolving ambient drone, lush pad, deep reverb, "
               "seamless loop, no percussion, no melody, slow swelling, {k}, 60 bpm"),
  "texture":  (2, 30, "free", "{s}, granular atmospheric texture, airy shimmer, "
               "no rhythm, ethereal, seamless loop, {k}"),
  "lead":     (2, 12, "soft", "{s}, soft ethereal synth lead, glassy bell, sparse "
               "melodic phrase, dreamy, reverb tail, {k}, {b} bpm"),
  "bass":     (1, 12, "soft", "{s}, deep warm sub bass drone, smooth sine, minimal, {k}, {b} bpm"),
  "perc":     (2, 6,  "soft", "{s}, delicate glass chimes, wooden clicks, hand bells, sparse, {b} bpm"),
  "vocal":    (1, 10, "soft", "{s}, wordless ethereal vocal pad, breathy choir aah, "
               "distant whisper texture, no lyrics, reverb"),
}

def clean(p: str) -> str:
    return p.strip().rstrip(".")[:300]

def expand_prompt(prompt: str, overrides: dict | None = None) -> dict:
    scene, key, bpm = clean(prompt), random.choice(KEYS), random.randint(60, 78)
    counts = overrides or {}
    subs = []
    for cat, (n, dur, q, tmpl) in TEMPLATES.items():
        for i in range(counts.get(cat, n)):
            pos = tmpl.format(s=scene, k=f"{key} major", b=bpm) + ", " + GLOBAL_POS
            subs.append({"category": cat, "index": i, "durationSec": dur,
                         "quantize": q, "positive": pos, "negative": GLOBAL_NEG,
                         "loop": cat in ("ambience", "texture")})
    return {"key": key, "bpm": bpm, "subprompts": subs}
```

---

## 4. RunPod Serverless Worker

### 4.1 Worker handler (`worker/handler.py`)

```python
import runpod, torch, io, os, boto3, soundfile as sf
from stable_audio_tools import get_pretrained_model
from stable_audio_tools.inference.generation import generate_diffusion_cond

MODEL, CFG = None, None
R2 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"],
                  aws_access_key_id=os.environ["R2_KEY"],
                  aws_secret_access_key=os.environ["R2_SECRET"])
BUCKET = os.environ["R2_BUCKET"]

def load():
    global MODEL, CFG
    if MODEL is None:
        MODEL, CFG = get_pretrained_model("stabilityai/stable-audio-open-1.0")
        MODEL = MODEL.to("cuda")

def render_one(sp, key, bpm):
    sr = CFG["sample_rate"]
    audio = generate_diffusion_cond(
        MODEL,
        steps=100, cfg_scale=7,
        conditioning=[{"prompt": sp["positive"],
                       "seconds_start": 0, "seconds_total": sp["durationSec"]}],
        negative_conditioning=[{"prompt": sp["negative"]}],
        sample_size=int(sr * sp["durationSec"]),
        device="cuda",
    )
    wav = audio.squeeze(0).to(torch.float32).clamp(-1, 1).cpu().numpy().T  # [frames, ch]
    if sp["loop"]:
        wav = crossfade_loop(wav, sr, ms=120)          # §2.4
    buf = io.BytesIO(); sf.write(buf, wav, sr, format="WAV"); buf.seek(0)
    return buf, sr

def handler(event):
    load()
    inp = event["input"]; job_id = inp["job_id"]
    clips, total = [], len(inp["subprompts"])
    for i, sp in enumerate(inp["subprompts"]):
        buf, sr = render_one(sp, inp["key"], inp["bpm"])
        key_path = f"packs/{job_id}/{sp['category']}_{sp['index']}.wav"
        R2.upload_fileobj(buf, BUCKET, key_path,
                          ExtraArgs={"ContentType": "audio/wav"})
        clips.append({"id": f"{sp['category']}_{sp['index']}",
                      "category": sp["category"],
                      "url": f"{os.environ['CDN_BASE']}/{key_path}",
                      "durationSec": sp["durationSec"], "quantize": sp["quantize"],
                      "key": inp["key"], "bpm": inp["bpm"]})
        runpod.serverless.progress_update(event, {"progress": int((i+1)/total*100)})
    return {"clips": clips}

runpod.serverless.start({"handler": handler})
```

### 4.2 Worker `Dockerfile`

```dockerfile
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04
WORKDIR /app
RUN pip install --no-cache-dir runpod stable-audio-tools soundfile boto3
# bake weights into the image to kill cold-start download time:
RUN python -c "from stable_audio_tools import get_pretrained_model; \
    get_pretrained_model('stabilityai/stable-audio-open-1.0')"
COPY handler.py loop_utils.py /app/
CMD ["python", "-u", "handler.py"]
```

> **ACE-Step fallback:** keep `handler.py` model-agnostic behind a `render_one()`
> interface. To swap, add `worker/models/acestep.py` exposing the same
> `render_one(sp, key, bpm) -> (wav, sr)` and select via an `ENGINE` env var. No API
> or frontend changes needed.

### 4.3 Convert to MP3 (optional, bandwidth)
WAV is large. For non-loop clips you can transcode to 192kbps MP3 in the worker
(`ffmpeg`/`pydub`) to cut CDN egress ~10×. Keep **ambience/texture loops as WAV** —
MP3 encoder padding ruins seamless loops.

---

## 5. Frontend Structure (Next.js + Tone.js)

### 5.1 Component tree

```
app/
  page.tsx                    # landing + PromptBar
  s/[slug]/page.tsx           # shared pack player (SSR fetch /s/{slug})
components/
  PromptBar.tsx               # input + Generate, shows job progress
  Stage.tsx                   # full-screen dark canvas, particle/orb backdrop
  PadGrid.tsx                 # grid of Pad
  Pad.tsx                     # one glowing orb; reacts to play/queue state
  TransportControls.tsx       # Play/Stop, AutoMode toggle, save/share
  GenerationOverlay.tsx       # loading state while polling
lib/
  audio/engine.ts             # singleton AudioEngine (Tone.js)
  audio/ambience.ts           # AmbienceLoop with modulating FX
  audio/pad.ts                # PadVoice: queue + auto-FX + quantize
  audio/fx.ts                 # buildAutoFXChain()
  audio/autoMode.ts           # AutoScheduler
  audio/keymap.ts             # QWERTY → pad index
  useGeneration.ts            # POST /generate + poll hook
state/
  store.ts                    # zustand: clips, status, transport, autoMode
```

### 5.2 The audio engine (core of the "smart pad")

**Signal graph**
```
AmbienceLoop ─► [auto-mod FX: filter LFO, chorus, wide reverb, autopan] ─┐
PadVoice (lead)  ─► [per-clip auto FX] ─► quantized start ───────────────┤
PadVoice (perc)  ─► [per-clip auto FX] ─► quantized start ───────────────┼─► masterBus
PadVoice (texture)► [per-clip auto FX] ─► free start ────────────────────┤      │
                                                                          │      ▼
                                                              master reverb + limiter ─► Destination
```

#### `lib/audio/engine.ts`
```ts
import * as Tone from "tone";

export class AudioEngine {
  master = new Tone.Channel({ volume: -6 }).toDestination();
  masterReverb = new Tone.Reverb({ decay: 6, wet: 0.25 });
  limiter = new Tone.Limiter(-1);
  bpm = 72;
  private started = false;

  constructor() {
    this.master.chain(this.masterReverb, this.limiter, Tone.getDestination());
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  async start(bpm = 72) {
    if (this.started) return;
    await Tone.start();
    this.bpm = bpm;
    Tone.getTransport().bpm.value = bpm;
    Tone.getTransport().start();
    this.started = true;
  }
}
export const engine = new AudioEngine();
```

#### `lib/audio/fx.ts` — automatic per-clip effect chain
```ts
import * as Tone from "tone";

// Deterministic-ish randomness seeded by clip id so a pack sounds consistent.
function seeded(id: string) {
  let h = 2166136261;
  for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0) / 2 ** 32;
}

export function buildAutoFXChain(category: string, id: string) {
  const rng = seeded(id);
  const nodes: Tone.ToneAudioNode[] = [];

  // Width / stereo enhancement on everything melodic + textural.
  if (category !== "bass") nodes.push(new Tone.StereoWidener(0.4 + rng() * 0.4));

  // Chorus for shimmer on leads / vocals / textures.
  if (["lead", "vocal", "texture"].includes(category))
    nodes.push(new Tone.Chorus({ frequency: 0.3 + rng(), depth: 0.5, wet: 0.4 }).start());

  // Ping-pong delay on leads + perc for "ear candy".
  if (["lead", "perc"].includes(category))
    nodes.push(new Tone.PingPongDelay({
      delayTime: ["8n", "8n.", "4n"][Math.floor(rng() * 3)],
      feedback: 0.25 + rng() * 0.2, wet: 0.3,
    }));

  // Per-clip reverb send (on top of master reverb).
  nodes.push(new Tone.Reverb({ decay: 3 + rng() * 4, wet: 0.2 + rng() * 0.25 }));

  // Slow autopan → organic movement.
  nodes.push(new Tone.AutoPanner({ frequency: 0.05 + rng() * 0.15, depth: 0.6 }).start());

  return nodes;
}
```

#### `lib/audio/ambience.ts` — evolving, self-modulating loop
```ts
import * as Tone from "tone";
import { engine } from "./engine";

export class AmbienceLoop {
  player: Tone.Player;
  private filter = new Tone.Filter(800, "lowpass");
  private filterLFO = new Tone.LFO({ frequency: 0.03, min: 500, max: 4000 }); // slow sweep
  private widthLFO = new Tone.LFO({ frequency: 0.02, min: 0.2, max: 0.9 });
  private widener = new Tone.StereoWidener(0.5);
  private chorus = new Tone.Chorus(0.2, 3.5, 0.4).start();

  constructor(url: string, loopStart = 0, loopEnd?: number) {
    this.player = new Tone.Player({
      url, loop: true, fadeIn: 2, fadeOut: 2,
      loopStart, loopEnd: loopEnd ?? 0, autostart: false,
    });
    this.player.chain(this.chorus, this.filter, this.widener, engine.master);
    this.filterLFO.connect(this.filter.frequency);
    this.widthLFO.connect(this.widener.width);
  }
  async load() { await Tone.loaded(); }
  play()  { this.filterLFO.start(); this.widthLFO.start(); this.player.start(); }
  stop()  { this.player.stop(); this.filterLFO.stop(); this.widthLFO.stop(); }
}
```

#### `lib/audio/pad.ts` — the smart, queued, auto-FX voice
```ts
import * as Tone from "tone";
import { engine } from "./engine";
import { buildAutoFXChain } from "./fx";

export type Clip = {
  id: string; url: string; category: string;
  quantize: "soft" | "free"; durationSec: number;
};

export class PadVoice {
  private player: Tone.Player;
  private fx: Tone.ToneAudioNode[];
  state: "idle" | "queued" | "playing" = "idle";

  constructor(public clip: Clip) {
    this.player = new Tone.Player({ url: clip.url, fadeIn: 0.15, fadeOut: 0.4 });
    this.fx = buildAutoFXChain(clip.category, clip.id);
    // player -> fx chain -> master
    this.player.chain(...this.fx, engine.master);
  }
  async load() { await Tone.loaded(); }

  /** Smart trigger: free clips start ~now; soft clips snap to the next slow grid mark. */
  trigger(onStateChange?: (s: PadVoice["state"]) => void) {
    if (this.state === "playing") return;
    const set = (s: PadVoice["state"]) => { this.state = s; onStateChange?.(s); };

    if (this.clip.quantize === "free") {
      set("queued");
      // gentle 0.5–1.5s humanized delay so it "fades in within a few seconds"
      const delay = 0.5 + Math.random();
      this.player.start(`+${delay}`);
      Tone.getTransport().scheduleOnce(() => set("playing"),
        `+${delay}`);
    } else {
      set("queued");
      // snap to next 2-bar boundary on the slow transport → feels intentional
      const next = Tone.getTransport().nextSubdivision("2m");
      this.player.start(next);
      Tone.getTransport().scheduleOnce(() => set("playing"), next);
    }
    // auto-release for one-shots; loops (texture) keep going until retoggled
    if (this.clip.category !== "texture") {
      Tone.getTransport().scheduleOnce(
        () => set("idle"),
        `+${this.clip.durationSec + 2}`);
    }
  }
  stop() { this.player.stop("+0.1"); this.state = "idle"; }
}
```

#### `lib/audio/autoMode.ts` — generative evolution when AutoMode is on
```ts
import * as Tone from "tone";
import { PadVoice } from "./pad";

export class AutoScheduler {
  private id?: number;
  constructor(private voices: PadVoice[]) {}

  start() {
    // every 2 bars, maybe trigger a random non-ambience element with variation
    this.id = Tone.getTransport().scheduleRepeat((time) => {
      if (Math.random() < 0.55) {
        const pool = this.voices.filter(v => v.state === "idle"
          && v.clip.category !== "ambience");
        const v = pool[Math.floor(Math.random() * pool.length)];
        v?.trigger();
      }
    }, "2m");
  }
  stop() { if (this.id !== undefined) Tone.getTransport().clear(this.id); }
}
```

#### `lib/audio/keymap.ts` + `components/Pad.tsx` (keyboard, low latency)
```ts
// keymap.ts
export const KEY_ROWS = ["qwertyu", "asdfghj", "zxcvbnm"];
export const keyToIndex = (() => {
  const map = new Map<string, number>();
  KEY_ROWS.join("").split("").forEach((k, i) => map.set(k, i));
  return map;
})();
```
```tsx
// in PadGrid.tsx — attach ONE listener, fire synchronously (no React re-render in path)
useEffect(() => {
  const down = (e: KeyboardEvent) => {
    if (e.repeat) return;                       // ignore key-hold autofire
    const idx = keyToIndex.get(e.key.toLowerCase());
    if (idx != null && voices[idx]) voices[idx].trigger(setPadState(idx));
  };
  window.addEventListener("keydown", down);
  return () => window.removeEventListener("keydown", down);
}, [voices]);
```

### 5.3 Generation hook
```ts
// lib/useGeneration.ts
import { useState, useRef, useCallback } from "react";

export function useGeneration() {
  const [status, setStatus] = useState<"idle"|"running"|"done"|"error">("idle");
  const [progress, setProgress] = useState(0);
  const [clips, setClips] = useState<any[]>([]);
  const timer = useRef<any>();

  const generate = useCallback(async (prompt: string) => {
    setStatus("running"); setProgress(0); setClips([]);
    const { jobId } = await fetch(`${API}/generate`, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ prompt }),
    }).then(r => r.json());

    timer.current = setInterval(async () => {
      const j = await fetch(`${API}/jobs/${jobId}`).then(r => r.json());
      setProgress(j.progress ?? 0);
      if (j.status === "done") { clearInterval(timer.current); setClips(j.clips); setStatus("done"); }
      if (j.status === "error") { clearInterval(timer.current); setStatus("error"); }
    }, 2000);
  }, []);

  return { generate, status, progress, clips };
}
```

### 5.4 UI / visual design (dark, minimalist, alive)
- **Stage:** full-bleed near-black (`#0a0a0f`) with a slow animated radial gradient and a
  lightweight particle field (`<canvas>` or `react-three-fiber` if budget allows). Avoid
  heavy 3D for MVP — a 2D canvas of drifting glowing dots is enough.
- **Pads as orbs:** 3×4 grid of circular glass orbs. Idle = dim glow tinted by category
  (ambience=indigo, lead=cyan, perc=gold, vocal=violet, bass=deep-blue, texture=teal).
  `queued` = pulsing ring. `playing` = bright bloom + subtle scale, with a bloom whose
  intensity follows a `Tone.Meter` on that voice (rAF loop reading `.getValue()`).
- **Transport bar (bottom):** big Play/Stop, an **Auto** toggle (glowing when on), and
  Save/Share. Keep everything else hidden — minimalism is the brand.
- **Mobile:** grid collapses to 2 columns; keyboard hints hidden; tap targets ≥56px.
  Note iOS requires the Play tap to call `Tone.start()` (handled in `engine.start`).

---

## 6. Step-by-Step Setup & Deployment

### 6.1 Local dev
```bash
# frontend
npx create-next-app@latest etherealpad-web --ts --tailwind --app
cd etherealpad-web && npm i tone zustand && npm run dev

# backend
mkdir etherealpad-api && cd etherealpad-api
python -m venv .venv && . .venv/Scripts/activate      # PowerShell: .venv\Scripts\Activate.ps1
pip install fastapi "uvicorn[standard]" httpx pydantic boto3
uvicorn app.main:app --reload --port 8000
```
`.env` (frontend): `NEXT_PUBLIC_API_BASE=http://localhost:8000`
`.env` (backend): `RUNPOD_ENDPOINT_ID, RUNPOD_API_KEY, R2_*, CDN_BASE, FRONTEND_ORIGIN`

### 6.2 RunPod Serverless
1. Build & push the worker image:
   ```bash
   docker build -t youruser/etherealpad-worker:1 ./worker
   docker push youruser/etherealpad-worker:1
   ```
2. RunPod → Serverless → **New Endpoint** → your image. GPU: **24GB (A5000/L4/3090)** is
   plenty for Stable Audio Open; start with **1× active worker = 0** (scale-to-zero),
   max workers 1–2. Set env vars (R2 creds, CDN_BASE).
3. **Idle timeout** 5–10s, **Flashboot ON** to shrink cold starts. Test via the RunPod
   UI "Run" with a sample `input`.
4. Copy the **Endpoint ID** + API key into the backend `.env`.

### 6.3 Storage + CDN (Cloudflare R2)
- Create an R2 bucket `etherealpad`. Add a **custom domain** (`cdn.etherealpad.app`) →
  free egress, CDN-cached. Set bucket CORS to allow your frontend origin (GET).
- Worker uploads with `ContentType` set; objects are public-read via the custom domain.
- **Lifecycle rule:** delete unsaved `packs/*` after 24–72h to control storage. Saved
  packs get copied to a `saved/` prefix excluded from expiry.

### 6.4 Deploy backend + frontend
- **Backend:** Fly.io or Render, smallest instance (256–512MB). Add Upstash Redis if >1
  replica. Set all env vars; expose `/health` for the platform healthcheck.
- **Frontend:** Vercel (free). Set `NEXT_PUBLIC_API_BASE` to the backend URL.
- **DB:** Supabase free tier (Postgres + auth). Tables: `users`, `soundscapes(id, slug,
  prompt, key, bpm, owner_id, created_at)`, `clips(id, soundscape_id, category, url,
  duration, quantize)`.

### 6.5 Low-cost playbook
| Lever | Action |
|---|---|
| GPU idle | Scale-to-zero + 5s idle timeout — you pay only during the ~30–90s render |
| Cold start | Bake weights into the image + Flashboot; pre-warm with a cron ping before launches/demos |
| Egress | R2 (zero egress fee) + MP3 for non-loop clips |
| Storage | 24–72h lifecycle expiry on unsaved packs |
| Backend | One tiny always-on box; everything heavy is client-side |
| Over-gen | Cache identical prompt hashes → instant reuse, zero GPU (cheap upgrade later) |

**Rough cost:** an L4 serverless render of 10 clips ≈ 60–120 GPU-seconds ≈ a few US
cents per generation. Idle = $0. Playback = $0.

---

## 7. Potential Challenges & Solutions

| Challenge | Mitigation |
|---|---|
| **Cold-start latency** (worker spin-up) | Bake weights into image, Flashboot on, async job + progress UI so the wait feels intentional; optional pre-warm ping |
| **Seamless loops** | Backend zero-crossing trim + equal-power crossfade (§2.4) **and** Tone.js `loopStart/loopEnd` + 2s fades. Keep loops as WAV (MP3 padding breaks loops) |
| **Browser autoplay policy** | Always call `Tone.start()` inside the Play tap; never autostart audio on load |
| **Trigger latency (keyboard)** | Single window listener, fire `player.start()` synchronously, no React state in the audio path; buffers pre-decoded on load |
| **Click/pop on retrigger** | Short `fadeIn/fadeOut` on every Player; soft-quantize start to grid; never hard-cut |
| **Mix gets muddy with many pads** | Master limiter + per-category gain staging; bass mono'd (no widener); cap simultaneous voices (e.g. 6) in AutoMode |
| **Model quality for ambient** | Stable Audio Open is strong here; if leads/vocals disappoint, flip those categories to ACE-Step via the `render_one` interface (§4.2) |
| **Large WAV downloads** | MP3 for one-shots, parallel lazy-load, show per-pad load state; consider 32kHz for non-critical clips |
| **iOS Safari audio limits** | Unlock on first tap; keep concurrent decoded buffers modest; test memory on real device |
| **Job/state across replicas** | Move `jobs` dict → Redis the moment you scale past one backend instance |
| **Abuse / cost runaway** | Rate-limit `/generate` per IP/session; cap clip counts; prompt-hash cache |

---

## 8. Future Enhancements
- **Session save/load polish:** snapshot which pads are active + AutoMode settings, not
  just the clips, so a saved scene reopens mid-vibe.
- **Share pages with embedded player + OG audio preview** for social.
- **User FX knobs** (the "Auto + master knobs" tier you deferred): reverb wetness,
  modulation depth, master filter.
- **Per-pad regeneration** ("reroll this chime") without regenerating the whole pack.
- **Prompt-hash cache / "explore" gallery** of past public packs (cheap, viral).
- **Tempo & key controls** exposed to the user; key-aware pitch-shifting of clips.
- **Record / export** a performance to a downloadable file (`Tone.Recorder`).
- **MIDI / external controller** support beyond QWERTY.
- **Adaptive AutoMode** that evolves density/brightness over a multi-minute arc.
- **ACE-Step A/B** toggle once both engines are wired, to compare quality live.

---

## 9. Build Order (suggested MVP path)
1. **Frontend audio engine with mock clips** (drop 10 royalty-free ambient clips in
   `/public`). Get pads, keyboard, ambience modulation, AutoMode, hybrid quantize feeling
   *right* — this is the soul of the product and needs zero GPU to iterate.
2. **FastAPI `/generate` + `/jobs` against a stub** worker (returns the mock URLs) to wire
   the async/polling UX.
3. **RunPod worker** with Stable Audio Open; render real clips to R2.
4. **Loop post-processing** + per-category prompt tuning (§2).
5. **Persistence + share links** (Supabase + `/s/{slug}` page).
6. Polish visuals, mobile, rate-limiting, cost guards.

> Ship steps 1–3 first; that's a fully playable generative pad. 4–6 are quality + growth.
```
