"""
Deterministic rules-engine prompt expander — the fallback for expander_llm.py.
Zero external deps, fully deterministic given (prompt, seed). Also used directly
in tests and offline/dev so the app works with no ANTHROPIC_API_KEY.
"""
from __future__ import annotations

import random

KEYS = ["C major", "D major", "E major", "A major"]
GLOBAL_POS = "high quality, clean, warm, balanced, smooth, hi-fi"
GLOBAL_NEG = "low quality, distorted, muddy, harsh, piercing, shrill, jarring, clipping"

# category: (count, durationSec, quantize, template)
# PITCH-SNAP PIPELINE: tonal categories (bass/mid/high/voice) are SINGLE SUSTAINED NOTES — one
# clear monophonic pitch. We detect that pitch and play the timbre in-key across a keyboard
# (sampler), so whatever pitch SAO picks doesn't matter. earcandy/perc/environmental are
# non-tonal character/atmosphere (no pitch = no clash).
TEMPLATES: dict[str, tuple[int, int, str, str]] = {
    "bass":          (1, 10, "free", "{s}, a single sustained bass note, one deep warm tone held perfectly "
                      "steady, clear monophonic pitch, no chord, no melody, no movement, seamless"),
    "mid":           (1, 10, "free", "{s}, a single sustained mid note, one warm mellow tone held perfectly "
                      "steady, clear monophonic pitch, no chord, no melody, no movement, seamless"),
    "high":          (1, 10, "free", "{s}, a single sustained high note, one soft airy tone held steady, "
                      "clear monophonic pitch, gentle, no chord, no melody, not harsh, seamless"),
    "environmental": (1, 12, "free", "{s}, realistic field recording matching the scene, soft distant natural "
                      "ambience, no music, not jarring, seamless"),
    "voice":         (1, 10, "free", "{s}, a single sustained vocal note, one soft breathy aah held steady, "
                      "clear monophonic pitch, one voice, no words, no chord, no melody, seamless"),
    "earcandy":      (2, 6, "soft", "{s}, delicate ear-candy sound design, soft glassy sparkles, gentle granular "
                      "clicks, subtle shimmer, no melody"),
    "perc":          (2, 4, "soft", "{s}, soft organic percussion hit, hand drum, conga, woodblock, gentle warm "
                      "tap, dry, no music, no melody"),
}

# Categories that loop continuously vs. one-shot accents.
LOOP_CATS = ("bass", "mid", "high", "environmental", "voice")


def clean(p: str) -> str:
    return p.strip().rstrip(".")[:300]


def expand_prompt(prompt: str, overrides: dict | None = None, seed: int | None = None) -> dict:
    rng = random.Random(seed)  # seedable → deterministic in tests
    scene = clean(prompt) or "ethereal ambient"
    key, bpm = rng.choice(KEYS), rng.randint(60, 78)
    counts = overrides or {}
    subs: list[dict] = []
    for cat, (n, dur, q, tmpl) in TEMPLATES.items():
        for i in range(counts.get(cat, n)):
            pos = tmpl.format(s=scene, k=key, b=bpm) + ", " + GLOBAL_POS
            subs.append({
                "category": cat, "index": i, "durationSec": float(dur),
                "quantize": "free" if cat in LOOP_CATS else "soft",
                "loop": cat in LOOP_CATS,
                "positive": pos, "negative": GLOBAL_NEG,
            })
    return {"key": key, "bpm": bpm, "subprompts": subs}
