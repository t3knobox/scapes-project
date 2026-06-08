"""
Stable Audio Open engine — the ambient/textural fallback. Strongest for drones/textures.

To ENABLE (it's a skeleton until you do):
  1. Add to the Docker image: `pip install stable-audio-tools soundfile` and bake the weights.
  2. Stable Audio Open is GATED on HuggingFace — accept the license and set HF_TOKEN in the
     endpoint env so the weights can download.
  3. Set ENGINE=stable_audio on the RunPod endpoint.
Returns (mono float32, sr) like the MusicGen engine, so handler.py is unchanged.
"""
import os

import numpy as np

_model = None
_cfg = None


def load():
    global _model, _cfg
    if _model is not None:
        return
    # from stable_audio_tools import get_pretrained_model
    # import torch
    # _model, _cfg = get_pretrained_model("stabilityai/stable-audio-open-1.0")  # needs HF_TOKEN
    # _model = _model.to("cuda")
    raise NotImplementedError(
        "stable_audio engine not enabled — see this file's docstring "
        "(add deps to the Dockerfile + set HF_TOKEN), or use ENGINE=musicgen."
    )


def render_one(sp, key, bpm):
    # from stable_audio_tools.inference.generation import generate_diffusion_cond
    # sr = _cfg["sample_rate"]; dur = float(sp.get("durationSec", 8))
    # audio = generate_diffusion_cond(
    #     _model, steps=100, cfg_scale=7,
    #     conditioning=[{"prompt": sp["positive"], "seconds_start": 0, "seconds_total": dur}],
    #     negative_conditioning=[{"prompt": sp.get("negative", "")}],
    #     sample_size=int(sr * dur), device="cuda",
    # )
    # mono = audio.squeeze(0).mean(0).to("cpu").numpy().astype("float32")
    # return mono / (np.max(np.abs(mono)) or 1.0) * 0.95, sr
    raise NotImplementedError
