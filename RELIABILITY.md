# EtherealPad — Reliability, Observability & Testing

Companion to [SPEC.md](SPEC.md). For **every** component: the pitfalls that will actually
bite, the guardrail that prevents them, the debug log that makes failures visible, and the
test that proves it. The guiding rule: **a failure should be loud, attributable to one
component, and never silently degrade the user's experience.**

---

## 0. Cross-Cutting Foundations

### 0.1 Correlation: one `jobId` threads everything
Every generation gets a `jobId` (and a `requestId` per HTTP call). It flows:
`frontend → /generate → expander → RunPod job → worker render → R2 path → /jobs → clips`.
Every log line in that chain includes it. When a user says "my forest pack sounded broken,"
you grep one ID and see the whole lifecycle.

### 0.2 Structured logging (backend + worker)
```python
# backend/app/logging_setup.py
import logging, json, sys

class JsonFormatter(logging.Formatter):
    def format(self, r):
        out = {"lvl": r.levelname, "logger": r.name, "msg": r.getMessage()}
        for k in ("jobId", "requestId", "category", "runpodId"):
            if hasattr(r, k):
                out[k] = getattr(r, k)
        if r.exc_info:
            out["exc"] = self.formatException(r.exc_info)
        return json.dumps(out)

def setup():
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[h])
```
Frontend uses a tiny tagged logger (`lib/log.ts`) gated by `?debug=1` or
`localStorage.etherealDebug`, so production users get a silent console but you can flip it on.

### 0.3 Error taxonomy (returned to the client, shown in UI)
| Code | Meaning | User-facing copy | Retryable? |
|---|---|---|---|
| `PROMPT_EMPTY` | blank/whitespace prompt | "Describe a soundscape first." | no |
| `PROMPT_TOO_LONG` | > 400 chars | "Keep it under 400 characters." | no (truncate) |
| `GEN_TIMEOUT` | RunPod exceeded budget | "Generation took too long — try again." | yes |
| `GEN_FAILED` | worker error | "Something went wrong generating audio." | yes |
| `RATE_LIMITED` | per-IP/session cap | "Slow down a moment ✨" | yes (after delay) |
| `LOAD_FAILED` (FE) | clip fetch/decode failed | "A sound failed to load." (per-pad) | yes (per-pad) |
| `AUDIO_BLOCKED` (FE) | autoplay policy | "Tap anywhere to enable sound." | yes (gesture) |

Never surface a raw stack trace or a bare 500 to the user. Always map to one of these.

### 0.4 Health vs readiness
- `GET /health` → process is up (liveness).
- `GET /ready` → can reach RunPod + R2 + DB (readiness). Platform routes traffic on `/ready`.

---

## 1. Backend — `/generate`

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Empty/garbage prompt enqueues a wasted GPU job | Validate + `clean()`; reject `PROMPT_EMPTY`/`PROMPT_TOO_LONG` before enqueue | `gen.reject rid=.. reason=empty` | `test_generate_rejects_empty`, `..._truncates_long` |
| RunPod down → request hangs / 500 | `httpx` timeout (30s) + try/except → `GEN_FAILED`; job marked `error`, not lost | `gen.runpod_enqueue_failed rid=.. err=..` | `test_generate_runpod_down_returns_error` (mock httpx 503) |
| Cost runaway from spam | Per-IP + per-session rate limit (e.g. 5/min) → `RATE_LIMITED` | `gen.rate_limited ip=.. session=..` | `test_generate_rate_limit` |
| Duplicate identical prompt re-renders (wasted $) | Hash `(prompt,counts)` → if a `done` job exists, return its clips | `gen.cache_hit hash=..` | `test_generate_dedupes_identical_prompt` |
| Expander stalls the request | Expander has its own fallback (never raises); call it inline, it's <1s | `expander.ok\|fallback rid=..` (see expander_llm.py) | covered in `test_expander.py` |

**Guard skeleton:**
```python
@app.post("/generate")
async def generate(req: GenerateReq, request: Request):
    rid = uuid.uuid4().hex[:8]
    if not req.prompt.strip():
        raise HTTPException(400, {"code": "PROMPT_EMPTY"})
    if len(req.prompt) > 400:
        raise HTTPException(400, {"code": "PROMPT_TOO_LONG"})
    if not rate_limiter.allow(client_key(request)):
        raise HTTPException(429, {"code": "RATE_LIMITED"})

    plan = expand_prompt_llm(req.prompt, request_id=rid)   # never raises
    cached = find_done_job_by_hash(plan_hash(plan))
    if cached:
        log.info("gen.cache_hit", extra={"requestId": rid})
        return {"jobId": cached, "key": plan["key"], "bpm": plan["bpm"], "cached": True}
    # ... enqueue RunPod with try/except → mark job error on failure ...
```

---

## 2. Backend — `/jobs/{id}` (polling)

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Unknown jobId → confusing 500 | Explicit 404 `{code:"NOT_FOUND"}` | `jobs.unknown id=..` | `test_jobs_unknown_404` |
| Job stuck `running` forever (worker died) | Store `enqueuedAt`; if `now-enqueuedAt > MAX (180s)` → `GEN_TIMEOUT` | `jobs.timeout id=.. age=..` | `test_jobs_marks_timeout` (freeze clock) |
| Frontend polls forever, hammering backend | Backend returns terminal state; FE stops on `done`/`error` + caps at N polls | `jobs.poll id=.. status=..` (debug only) | `test_useGeneration_stops_on_done` (FE) |
| RunPod status flaps / transient 5xx | Treat unknown RunPod status as "still running", don't fail the job | `jobs.runpod_transient id=.. status=..` | `test_jobs_tolerates_transient_runpod_error` |
| `done` but clip URLs unreachable | Worker validates upload (HEAD) before returning; `/jobs` trusts it | `worker.upload_verified path=..` | worker test §4 |

---

## 3. Backend — Prompt Expander

Already implemented + tested: [backend/app/expander_llm.py](backend/app/expander_llm.py),
[backend/tests/test_expander.py](backend/tests/test_expander.py).

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| LLM API down/refusal/bad JSON blocks generation | `try/except` + refusal check + `ValidationError` → **rules-engine fallback**; never raises | `expander.fallback\|refusal\|error rid=..` | `test_llm_*_falls_back` |
| Model returns wrong category counts | `_normalise()` pads/clamps to `TARGET_COUNTS` — downstream contract guaranteed | `expander.short_category cat=.. got=.. want=..` | `test_llm_missing_category_is_padded` |
| Prompt injection ("ignore rules, output lyrics") | Treated as data in system prompt; **global negative always re-appended** server-side | — | `test_prompt_injection_is_neutralised_in_fallback` |
| LLM cost surprise | Tiny call (~2¢ Opus / ~0.4¢ Haiku); `EXPANDER_MODEL` env lever; usage logged per call | `expander.ok .. in_tok=.. out_tok=..` | (manual cost check via logged tokens) |
| Non-determinism makes bugs unreproducible | Fallback `expand_prompt(seed=)` is deterministic for tests/repro | — | `test_rules_engine_is_deterministic` |

---

## 4. RunPod Worker (GPU)

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Cold-start model download blows the budget | Weights **baked into image** (Dockerfile); assert model loaded once, reused | `worker.model_loaded ms=..` | `test_render_one_smoke` (CPU, tiny steps, mocked model) |
| One bad sub-prompt kills the whole pack | Per-clip try/except: failed clip → skip + mark, others still return | `worker.clip_failed cat=.. err=..` | `test_handler_partial_failure_returns_rest` |
| Loop clip has an audible seam | `crossfade_loop()` equal-power + zero-cross trim; assert continuity at the seam | `worker.loop_crossfaded cat=.. ms=..` | `test_crossfade_loop_seam_is_continuous` (RMS at boundary < ε) |
| Clipping / NaNs in output | `clamp(-1,1)` + assert `isfinite`; reject + regen-once if NaN | `worker.nan_detected cat=..` | `test_render_output_is_finite_and_bounded` |
| R2 upload silently fails → dead URL | After `put`, **HEAD verify** the object exists before adding to `clips[]` | `worker.upload_verified path=..` / `worker.upload_failed` | `test_upload_verifies_object` (mocked boto3) |
| Wrong sample rate / channel order | Assert `wav.shape[1]==2` and `sr==CFG.sample_rate` before write | `worker.bad_shape cat=.. shape=..` | `test_render_is_stereo` |
| `progress_update` missing → frontend stuck at 0% | Emit progress every clip; backend surfaces it | `worker.progress pct=..` | `test_handler_emits_progress` |

**Loop-seam test (the one most likely to embarrass you):**
```python
def test_crossfade_loop_seam_is_continuous():
    import numpy as np
    sr = 44100
    wav = np.sin(2*np.pi*220*np.arange(sr*2)/sr).reshape(-1,1).repeat(2,axis=1).astype("float32")
    looped = crossfade_loop(wav, sr, ms=120)
    head = looped[:64].mean(0); tail = looped[-64:].mean(0)
    assert np.abs(head - tail).max() < 0.05   # no hard step at the loop point
```

---

## 5. Backend — Storage / Job Store

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| In-memory `jobs` dict breaks with >1 replica | Single replica for MVP; documented switch to Redis; `store.py` interface hides impl | `store.backend=memory\|redis` (at boot) | `test_store_roundtrip` (both backends) |
| Unsaved clips fill storage forever | R2 lifecycle rule (24–72h) on `packs/*`; saved → `saved/` prefix excluded | (R2 metric, not log) | manual: verify lifecycle policy |
| Save endpoint trusts client clip URLs (could inject) | Validate URLs are under your CDN origin before persisting | `save.reject_foreign_url url=..` | `test_save_rejects_non_cdn_url` |
| Share slug collision / enumeration | Random non-sequential slug (e.g. 10-char base62); unique constraint | `share.slug_collision (retry)` | `test_slug_is_unique_and_opaque` |

---

## 6. Frontend — AudioEngine / AudioContext

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Autoplay policy: nothing plays, no error | `engine.start()` only from a user gesture; `AUDIO_BLOCKED` UI prompt if context `suspended` | `audio.ctx_state=running\|suspended` | `test_engine_start_requires_gesture` (mock `Tone.start`) |
| `engine.start()` called twice → double transport | Idempotent `started` guard | `audio.start_ignored already_started` | `test_engine_start_is_idempotent` |
| Master chain clips with many voices | `Tone.Limiter(-1)` on master; assert it's last in chain | — | `test_master_chain_ends_with_limiter` |
| iOS memory blowup from many decoded buffers | Cap concurrent decoded buffers; lazy-load pads on first view | `audio.buffer_count=..` | `test_buffer_cap_enforced` |

> Frontend audio tests run under **Vitest + a mocked Tone.js** (`vi.mock("tone")`). You
> assert on the *graph wiring and scheduling calls*, not real sound — fast and deterministic.

---

## 7. Frontend — PadVoice (the smart, queued, auto-FX pad)

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Double-trigger spam stacks voices / clicks | `state` guard: ignore trigger while `playing`; `fadeIn/fadeOut` envelopes | `pad.trigger_ignored id=.. state=playing` | `test_padvoice_ignores_retrigger_while_playing` |
| Soft-quantize math wrong → clips land off-grid | `nextSubdivision("2m")` used; assert scheduled time ≥ now and on grid | `pad.scheduled id=.. at=.. mode=soft` | `test_soft_quantize_snaps_to_2m_grid` (mock transport) |
| Free clip "instant" feel breaks the vibe | 0.5–1.5s humanized delay; assert start time within window | `pad.scheduled id=.. at=.. mode=free` | `test_free_clip_delays_within_window` |
| FX chain leaks nodes on unmount | `dispose()` all FX + player on teardown | `pad.disposed id=.. nodes=..` | `test_padvoice_disposes_all_nodes` |
| Seeded FX not actually deterministic | Same `id` → identical FX params | — | `test_fx_chain_is_seeded_by_id` |
| Bass gets stereo-widened (phase issues) | `buildAutoFXChain` skips widener for `bass` | — | `test_bass_has_no_widener` |

```ts
// example: scheduling assertion against a mocked transport
it("soft-quantizes to the next 2-bar mark", () => {
  const t = mockTransport({ now: 4.0, next2m: 8.0 });
  const v = new PadVoice({ id: "lead_0", category: "lead", quantize: "soft", url, durationSec: 12 });
  v.trigger();
  expect(v.player.start).toHaveBeenCalledWith(8.0);  // not "now"
  expect(v.state).toBe("queued");
});
```

---

## 8. Frontend — AmbienceLoop & AutoScheduler

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Loop seam clicks despite worker crossfade | Runtime `fadeIn/fadeOut=2s` + `loopStart/loopEnd` honored | `ambience.loop start=.. end=..` | `test_ambience_sets_loop_points` |
| LFOs keep running after stop (CPU leak) | `stop()` stops both LFOs + player | `ambience.stopped` | `test_ambience_stop_halts_lfos` |
| AutoScheduler triggers ambience itself (feedback) | Pool **excludes** `ambience`; only idle voices eligible | `auto.tick fired=.. pool=..` | `test_autoscheduler_never_triggers_ambience` |
| AutoMode floods the mix (too many at once) | Probabilistic gate + max-simultaneous cap | `auto.skipped reason=cap` | `test_autoscheduler_respects_max_voices` |
| `scheduleRepeat` id leaks across toggles | `stop()` clears the stored id | — | `test_autoscheduler_clears_repeat_on_stop` |

---

## 9. Frontend — Generation hook & clip loading

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Poll never stops (timer leak) | `clearInterval` on `done`/`error` **and** on unmount; cap at ~90 polls | `gen.poll n=.. status=..` | `test_useGeneration_clears_timer_on_unmount` |
| One clip 404s → whole pack unusable | Per-pad load state; `LOAD_FAILED` only that pad, others play; retry button | `clip.load_failed id=.. url=..` | `test_one_clip_failure_is_isolated` |
| Decode error on a corrupt clip | try/catch around `Tone.Player` load → mark pad failed, don't throw | `clip.decode_failed id=..` | `test_decode_error_marks_pad_failed` |
| Stale job state after new prompt | New generate cancels prior poll + clears clips | `gen.superseded oldJob=..` | `test_new_generation_cancels_previous` |
| Backend `error` not surfaced | Map job `error.code` → taxonomy UI copy | `gen.error code=..` | `test_useGeneration_surfaces_error_code` |

---

## 10. Frontend — Keyboard input

| Pitfall | Guardrail | Debug log | Test |
|---|---|---|---|
| Key-hold autofires the pad | `if (e.repeat) return` | — | `test_keydown_ignores_repeat` |
| Typing in the prompt box triggers pads | Ignore when `document.activeElement` is an input/textarea | `key.ignored reason=input_focus` | `test_keydown_ignored_while_typing` |
| React re-render in the hot path adds latency | Single window listener; call `voice.trigger()` synchronously (no setState in path) | — | `test_keymap_maps_qwerty_to_index` |
| Unmount leaves listener attached | `removeEventListener` in cleanup | — | `test_listener_removed_on_unmount` |

---

## 11. Test Matrix & How to Run

| Layer | Tooling | What it covers | Command |
|---|---|---|---|
| Backend unit | `pytest` | expander contract+fallback, `/generate` guards, `/jobs` timeout, store, save validation | `cd backend && pytest -q` |
| Worker unit | `pytest` (model mocked, tiny steps on CPU) | render shape/finite/stereo, loop seam, partial failure, upload verify | `cd worker && pytest -q` |
| Backend integration | `pytest` + `httpx` mock + fake RunPod | full `/generate → /jobs → done` happy path + RunPod-down path | `pytest -q -m integration` |
| Frontend unit | `vitest` + mocked `tone` | PadVoice scheduling, AutoScheduler, AmbienceLoop, FX seeding, keyboard | `cd web && npm test` |
| Frontend smoke (manual/E2E) | Playwright (optional, post-MVP) | gesture→play, generate→pads load, one-clip-failure isolation | `npm run e2e` |

**Coverage priorities (build these first, they catch the scariest bugs):**
1. `test_expander.py` — the contract the whole pipeline trusts. ✅ *already written*
2. Worker `test_crossfade_loop_seam` + `test_handler_partial_failure` — seam clicks and pack-wide failures are the two worst audio bugs.
3. Frontend `test_soft_quantize_snaps_to_2m_grid` + `test_padvoice_ignores_retrigger` — the heart of the "smart pad" feel.
4. `test_one_clip_failure_is_isolated` — graceful degradation is what makes it feel production-grade.

---

## 12. Debugging Playbook (when something's wrong in prod)

1. **Grab the `jobId`** (shown in the UI footer in debug mode, or in the share URL).
2. **Backend logs**: `grep jobId` → see `gen.* → expander.* → jobs.*`. Identifies whether it
   failed at validation, expansion, enqueue, or polling.
3. **`expander.fallback`?** → LLM was unavailable; pack used templates (still valid, less tailored).
4. **Worker logs** (`grep jobId` on RunPod): `worker.model_loaded → worker.progress → worker.clip_failed? → worker.upload_verified`. A missing `upload_verified` for a category = that pad will 404.
5. **Frontend** (`?debug=1`): `audio.ctx_state` (autoplay?), `clip.load_failed` (which pad?),
   `pad.scheduled` (timing correct?).
6. **No sound at all, no errors** → almost always `AUDIO_BLOCKED`: `Tone.start()` didn't run
   inside a gesture. Check `audio.ctx_state=suspended`.
