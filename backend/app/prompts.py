"""
Deterministic rules-engine prompt expander — the fallback for expander_llm.py.
Zero external deps, fully deterministic given (prompt, seed). Also used directly
in tests and offline/dev so the app works with no ANTHROPIC_API_KEY.
"""
from __future__ import annotations

import random

KEYS = ["C major", "D major", "E major", "A major"]
GLOBAL_POS = "ethereal, peaceful, dreamy, crisp, airy, high quality, clean, hi-fi"
GLOBAL_NEG = ("harsh, distorted, aggressive, lo-fi, clipping, spoken words, "
              "lyrics, singing words, heavy drums, EDM, club")

# category: (count, durationSec, quantize, template)
TEMPLATES: dict[str, tuple[int, int, str, str]] = {
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
                "quantize": "free" if cat in ("ambience", "texture") else "soft",
                "loop": cat in ("ambience", "texture"),
                "positive": pos, "negative": GLOBAL_NEG,
            })
    return {"key": key, "bpm": bpm, "subprompts": subs}
