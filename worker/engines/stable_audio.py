"""
Stable Audio Open engine (via diffusers StableAudioPipeline).

Generates the CHARACTER layer of the hybrid: ear-candy SFX, percussion one-shots, and
environmental sounds (birds/water/wind). The client-side synth handles all the tonal/musical
content (chords, bass, key-jabs), so this engine never needs to be "in key."

Gated model → needs HF_TOKEN (env). On RunPod serverless it downloads at cold-start unless a
network volume caches it (set HF_HOME to the volume). Returns (mono float32, sr) like the others.
"""
import os

import numpy as np
import torch

_pipe = None


def load():
    global _pipe
    if _pipe is not None:
        return
    from diffusers import StableAudioPipeline

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    _pipe = StableAudioPipeline.from_pretrained(
        "stabilityai/stable-audio-open-1.0",
        torch_dtype=torch.float16,
        token=token,
    ).to("cuda")


def render_one(sp, key, bpm):
    dur = max(2.0, min(float(sp.get("durationSec", 8)), 30.0))
    # deterministic-ish seed per clip so a pack is stable across regenerations
    seed = abs(hash((sp.get("category", ""), sp.get("index", 0)))) % (2**31)
    gen = torch.Generator("cuda").manual_seed(seed)

    audios = _pipe(
        prompt=sp["positive"],
        negative_prompt=sp.get("negative") or "low quality, distorted, muddy",
        num_inference_steps=100,
        audio_end_in_s=dur,
        num_waveforms_per_prompt=1,
        generator=gen,
    ).audios

    arr = audios[0].to(torch.float32).cpu().numpy()  # [channels, samples]
    if arr.ndim == 2:
        arr = arr.mean(axis=0)  # handler encodes mono; the client widener re-spatializes
    sr = int(_pipe.vae.sampling_rate)  # 44100
    peak = float(np.max(np.abs(arr))) or 1.0
    return arr / peak * 0.95, sr
