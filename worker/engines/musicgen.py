"""
MusicGen (Meta) engine via HuggingFace transformers. No token / gating needed.

Aesthetic bias (from the reference): crisp, bright, airy high-frequency ear candy with
glassy shimmer + delicate transients — warm/deep instead for bass. The synth HarmonyEngine
on the client provides the chordal backbone; these clips are the texture/leads/perc/vocals.
"""
import os

import numpy as np
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MODEL_ID = os.environ.get("MUSICGEN_MODEL", "facebook/musicgen-medium")  # small = faster, lower-q

# Per-category sonic flavour appended to each prompt.
BRIGHT = ("crisp bright airy high frequencies, glassy shimmer, sparkling detail, "
          "delicate transients, hi-fi, clean, ear candy")
WARM = "warm smooth deep, clean, hi-fi, no high harshness"

_model = None
_proc = None


def load():
    global _model, _proc
    if _model is None:
        _proc = AutoProcessor.from_pretrained(MODEL_ID)
        _model = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID).to("cuda")
        _model.eval()


def _suffix(category: str) -> str:
    return WARM if category in ("bass", "ambience") else BRIGHT


def render_one(sp, key, bpm):
    prompt = f"{sp['positive']}, {_suffix(sp['category'])}"
    dur = float(sp.get("durationSec", 8))
    # MusicGen runs at ~50 tokens/sec and hard-errors (CUDA index assert) past ~30s,
    # poisoning the GPU for the rest of the batch. Cap well under that.
    max_new = min(int(dur * 50), 1000)

    inputs = _proc(text=[prompt], padding=True, return_tensors="pt").to("cuda")
    with torch.no_grad():
        out = _model.generate(**inputs, do_sample=True, guidance_scale=3.0, max_new_tokens=max_new)

    sr = _model.config.audio_encoder.sampling_rate  # 32000
    audio = out[0, 0].cpu().numpy().astype("float32")  # mono [samples]
    peak = float(np.max(np.abs(audio))) or 1.0
    return audio / peak * 0.95, sr  # normalize to -0.45 dBFS
