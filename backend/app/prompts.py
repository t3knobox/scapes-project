"""
Deterministic rules-engine prompt expander — the fallback for expander_llm.py.
Zero external deps, fully deterministic given (prompt, seed). Also used directly
in tests and offline/dev so the app works with no ANTHROPIC_API_KEY.
"""
from __future__ import annotations

import random

KEYS = ["C major", "D major", "E major", "A major"]
GLOBAL_POS = "high quality, clean, hi-fi, crisp, detailed, ethereal"
GLOBAL_NEG = "low quality, distorted, muddy, lo-fi, harsh clipping"

# category: (count, durationSec, quantize, template)
# HYBRID: the client-side synth handles ALL tonal/musical content (chords, bass, key-jabs),
# always in-key and reliable. This generated layer is Stable Audio Open's job — the CHARACTER:
# ear-candy SFX, percussion one-shots, and environmental sounds. None of it needs to be in key.
TEMPLATES: dict[str, tuple[int, int, str, str]] = {
    "texture":       (2, 12, "free", "{s}, ambient atmospheric texture, airy evolving drone, soft pad, "
                      "no melody, no beat, ethereal, seamless"),
    "environmental": (2, 12, "free", "{s}, realistic field recording of the natural environment, "
                      "birdsong, flowing water, wind, rustling, ambient nature, no music, seamless"),
    "earcandy":      (2, 6, "soft", "{s}, delicate ear-candy sound design, glassy sparkles, granular clicks, "
                      "soft foley, shimmer, crisp high frequencies, no melody"),
    "perc":          (2, 4, "soft", "{s}, single isolated percussion hit, dry acoustic drum, hand percussion, "
                      "woodblock, rim, crisp transient, no music, no melody"),
}

# Categories that loop continuously (atmosphere/nature) vs. one-shot accents.
LOOP_CATS = ("texture", "environmental")


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
