"""
ACE-Step engine — open, ungated, fast, full-music. Good for melodic leads.

To ENABLE (skeleton until you do):
  1. Add ACE-Step to the Docker image per its repo (pip install + bake weights).
  2. Set ENGINE=ace_step on the RunPod endpoint.
Returns (mono float32, sr) like the other engines, so handler.py is unchanged.
"""

_pipe = None


def load():
    global _pipe
    if _pipe is not None:
        return
    # from acestep.pipeline_ace_step import ACEStepPipeline
    # _pipe = ACEStepPipeline(checkpoint_dir="...", device="cuda")
    raise NotImplementedError(
        "ace_step engine not enabled — install ACE-Step in the Dockerfile and wire its "
        "pipeline here, or use ENGINE=musicgen."
    )


def render_one(sp, key, bpm):
    # audio, sr = _pipe(prompt=sp["positive"], duration=float(sp.get("durationSec", 8)), ...)
    # return audio.astype("float32"), sr
    raise NotImplementedError
