"""
RunPod Serverless handler for audio-clip generation.

Pluggable engine (ENGINE env): musicgen (default) | stable_audio | ace_step.
Each engine module exposes load() and render_one(subprompt, key, bpm) -> (mono float32, sr).

Output: clips with the audio inlined as a base64 data-URI `url`, so the existing
backend /generate -> /jobs flow passes them straight through to the browser with no
storage/CDN needed for MVP. (Swap to R2 + real URLs when you scale.)
"""
import base64
import logging
import os

import numpy as np
import runpod

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("worker")

ENGINE = os.environ.get("ENGINE", "musicgen")
if ENGINE == "musicgen":
    from engines import musicgen as eng
elif ENGINE == "stable_audio":
    from engines import stable_audio as eng
elif ENGINE == "ace_step":
    from engines import ace_step as eng
else:
    raise RuntimeError(f"unknown ENGINE={ENGINE!r} (use musicgen | stable_audio | ace_step)")


def to_mp3_b64(audio: np.ndarray, sr: int) -> str:
    import lameenc

    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(128)
    enc.set_in_sample_rate(sr)
    enc.set_channels(1)
    enc.set_quality(2)
    mp3 = enc.encode(pcm) + enc.flush()
    return base64.b64encode(mp3).decode()


def handler(event):
    eng.load()
    inp = event["input"]
    subs = inp["subprompts"]
    key, bpm = inp.get("key"), inp.get("bpm")
    clips, total = [], len(subs)

    for i, sp in enumerate(subs):
        try:
            audio, sr = eng.render_one(sp, key, bpm)
            clips.append({
                "id": f"{sp['category']}_{sp['index']}",
                "category": sp["category"],
                "url": f"data:audio/mpeg;base64,{to_mp3_b64(audio, sr)}",
                "durationSec": sp["durationSec"],
                "quantize": sp["quantize"],
                "loop": sp.get("loop", False),
                "key": key,
                "bpm": bpm,
            })
        except Exception:
            log.exception("clip failed cat=%s idx=%s", sp.get("category"), sp.get("index"))
        runpod.serverless.progress_update(event, {"progress": int((i + 1) / total * 100)})

    log.info("done: %d/%d clips", len(clips), total)
    return {"clips": clips}


runpod.serverless.start({"handler": handler})
