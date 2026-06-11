# The Variation / Effects Engine + Star-field UI — Plan

Status: **proposal for review — not yet executed.**
Builds on the validated sampler architecture (see `memory/scapes-sampler-architecture`).

## ⛔ GATE: pitch correction must work first
The entire effects phase sits ON TOP of pitch correction (every tonal pad → cents-corrected
sampled instrument playing in-key notes). **If pitch correction isn't solid, we do NOT move on**
— effects/EQ/limiting on an off-key mix just polishes a broken foundation. Validate the in-key
pads (`?sampler`) by ear before starting Phase 1+.

## Goal
Turn a handful of AI-generated timbres into a deep, alive, *never-the-same-twice* instrument the
player can sculpt — without ever going off-key, and without re-awakening the jitter we just killed.

Three pillars:
1. **Instant, in-control interaction** (responsive triggers).
2. **A variation/effects engine** (one sample → endless dreamy variation).
3. **A draggable "star-field" UI** to sculpt it (no knobs).

---

## Phase 0 — Instant pad response (small, do first)
**Problem:** pads currently queue — "soft" clips snap to the next 2-bar mark, "free" clips wait
0.5–1.5 s (`pad.ts` `trigger()`). That delay makes taps feel laggy / not-in-control.

**Change:** trigger pads ~immediately (a tiny `+0.02–0.05 s` lookahead for scheduler safety),
drop the quantize-to-bar wait.
- Trade-off: rhythmic/perc clips no longer auto-snap to the grid. For a tap-to-play ambient
  toy that's the *right* call — responsiveness > grid-lock, and the harmony bed stays the timed
  backbone regardless.
- Keep the loop-toggle + crash-proofing already in `trigger()`.
- ~5-line change to `pad.ts`. Verifiable instantly by ear.

---

## Phase 1 — The variation/effects engine (audio)

### Design principle
A small set of **composable, cheap-by-default effect modules**, each with a `0..1` amount.
Every voice gets a **rack** instance. Amounts are driven by: per-category defaults + per-trigger
randomization + (Phase 3) the UI position. **Shared sends** (one reverb, one shimmer-delay) keep
CPU low — voices *send* to them rather than each owning a heavy effect.

### Modules (Tone.js), in chain order
1. **Source variation** (pre-fx, on the player/sampler):
   - in-scale note choice (pitched voices stay on scale tones → always in-key)
   - reverse playback; random start-offset (pull different gestures from one clip)
   - playback-rate micro-wobble (LFO on detune) → life
2. **Tone-shaping:** filter (LP/BP) with optional LFO sweep; sparing wavefold/bitcrush for grit
3. **Space / modulation:**
   - chorus / phaser (modulated) → shimmer + width
   - **modulated reverb send** (global reverb whose size/wet breathes via LFO)
   - **pitch-shifting feedback delay send** (each echo ± a scale step → infinite ascend/descend)
   - **granular freeze/stretch** (`Tone.GrainPlayer`) → weightless glassy pads
4. **Output:** gain + (modulated) auto-pan

### CPU budget (hard constraint — jitter)
- **Free** (use generously): filter+LFO, chorus, tremolo/pan, playbackRate, reverse, offset,
  and the **shared** reverb + shimmer sends.
- **Medium** (1–2 voices): heavy shimmer feedback.
- **Heavy** (rare / on-demand): per-voice granular, per-voice convolution.
- Modulation rides a **few shared LFOs** on cheap params (cutoff, wet, pan).

### Per-trigger variation ("alive")
- Seeded-random per trigger nudges amounts within tasteful ranges (cutoff, reverb send, pan,
  start-offset, occasional reverse/octave).
- A per-voice **variation intensity** (0..1) scales how wild it gets.
- Pitched voices: choices restricted to scale tones → never off-key.

### Specific instruments built on the engine
- **Lead arpeggiator:** walks scale/chord tones in evolving patterns (up/down/broken/wander),
  varying step length + decay + rests, through modulated reverb + shimmer. In-key by construction.
- **Percussion variation:** reverb throws, reverse hits, stretched/pitched perc (no pitch to
  protect → mangle freely).

### Data model / files
- New `lib/audio/voiceFx.ts` — a `VoiceFX` rack (modules + `setAmount(name, 0..1)` +
  `randomize(intensity)`); supersedes/extends `fx.ts` `buildAutoFXChain`.
- `engine.ts` — shared reverb + shimmer send buses + shared LFOs on the master.
- `lib/audio/effectField.ts` — pure `(x, y) -> amounts` mapping (the UI ↔ audio contract;
  built now, consumed by Phase 3).
- `pad.ts` — voices own a `VoiceFX`; `trigger()` calls `randomize()`.
- New `lib/audio/lead.ts` — the arpeggiator instrument.
- Temporary debug hooks (URL params / console) to audition amounts by ear before the UI exists.

### Phase 1 build order
1. `VoiceFX` rack + shared sends; port current category defaults onto it.
2. Per-trigger randomization + variation intensity.
3. Reverse / start-offset / playback-wobble.
4. Lead arpeggiator.
5. Shimmer-delay + modulated reverb breathing.
6. Granular module (behind a flag, sparing).
7. `effectField.ts` mapping.

---

## Phase 2 — Tighten the sampler (parallel, small)
From the validated prototype's open threads:
- Pick the sample **nearest the chord register** (not the lowest) + **tight voicings** → kills warp.
- Promote `?sampler` from experiment to a real path for bass + pad + lead.
- (Worker, later) generate dedicated **single-note** samples instead of borrowing a pad clip.

---

## Phase 3 — The star-field UI (after the engine exists)
- A 2D draggable field; **the orbs are the dots** — a sound's *position* = its effect treatment.
- Regions = effects (reverb / shimmer / granular / reverse / clean); **proximity = intensity**;
  multiple dots blend. Driven entirely by `effectField.ts`.
- Drag updates that voice's rack live. Constellation aesthetic: trails, glow scaled by intensity.
- Touch-drag for mobile.
- **Open question:** dots = the sounds themselves (preferred) vs separate effect-emitters.

---

## Phase 4 — Mix integrity (the signal chain)
The full per-sound path, and where each piece lives:
```
sampled instrument / raw texture
  → Base effects        (LFO reverb, delay, filter sweeps, modulation)   ← Phase 1 (planned)
  → Spectral auto-balance (EQ + polyphony-aware gain)                    ← NEW
  → [ user control via the effects graph / star-field ]                  ← Phase 3 (planned)
  → Master limiter      (final loudness cap / ear protection)            ← partly exists
  → output
```

### Spectral auto-balance (NEW — the anti-clip / anti-mud system)
Crucial so stacking many pads doesn't distort or turn to mush:
- Give each pad a **frequency profile** (FFT once at load, or band from its detected pitch +
  category) → know which bands it occupies.
- When several pads play **together**, find **overlapping bands** that will sum hot → **lower the
  overlapping voices by pure math** (e.g. equal-power: each of N overlapping voices ×1/√N) so the
  combined level stays controlled. Recompute as the active set changes (2, 3, 4, 5+ voices).
- Net effect: an automatic, polyphony-aware mixer that keeps the stack clean and balanced.

### Master limiter (mostly already there)
`engine.ts` already runs a `Tone.Limiter(-1)` on the master bus. Phase 4 = make it the **final,
deliberate** cap (tune ceiling, maybe a gentle soft-clip before it) so nothing ever blows out the
listener — the safety net *under* the auto-balance.

## Verification
- **Audio:** by ear (user), module by module; confirm in-key holds and **no jitter returns**
  (watch for dropouts with many voices + effects active — keep the CPU budget honest).
- **UI:** drag responsiveness; position→sound mapping feels intuitive; mobile touch works.

## Decisions (locked 2026-06-10)
1. Star-field model: **dots = the sounds themselves** (drag each voice through the effect-space).
2. Default vibe: **middle** — characterful but not maximal/abrasive.
3. Lead: **active melody, but intermittent** — comes and goes, doesn't persist constantly.
