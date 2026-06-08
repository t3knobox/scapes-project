# Runpod Hub builds with the REPO ROOT as context and this file as the Dockerfile,
# so COPY paths are repo-root-relative (worker/...).
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /app

COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# No weight bake: Stable Audio Open is gated (no build-time token available), so it
# downloads at runtime. Cache it on a RunPod network volume (set HF_HOME to the volume)
# to keep cold starts fast.
COPY worker/ /app

CMD ["python", "-u", "handler.py"]
