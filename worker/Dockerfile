# NOTE: build context is the REPO ROOT (RunPod's GitHub deploy builds from root and only
# takes a Dockerfile path). So COPY paths are repo-root-relative: worker/...
# Local build from repo root:  docker build -f worker/Dockerfile -t scapes-worker .
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /app

COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake MusicGen weights into the image so cold starts don't pay the download.
# (Comment out if you'll use a different ENGINE and bake those weights instead.)
RUN python -c "from transformers import AutoProcessor, MusicgenForConditionalGeneration; \
    m='facebook/musicgen-medium'; AutoProcessor.from_pretrained(m); \
    MusicgenForConditionalGeneration.from_pretrained(m)"

COPY worker/ /app

CMD ["python", "-u", "handler.py"]
