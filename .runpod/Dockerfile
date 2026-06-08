# Runpod Hub builds with the REPO ROOT as context and this file as the Dockerfile,
# so COPY paths are repo-root-relative (worker/...).
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /app

COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake MusicGen weights into the image so cold starts don't pay the download.
RUN python -c "from transformers import AutoProcessor, MusicgenForConditionalGeneration; \
    m='facebook/musicgen-medium'; AutoProcessor.from_pretrained(m); \
    MusicgenForConditionalGeneration.from_pretrained(m)"

COPY worker/ /app

CMD ["python", "-u", "handler.py"]
