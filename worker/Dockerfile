# NOTE: build context is the REPO ROOT (RunPod's GitHub deploy builds from root).
# Local build from repo root:  docker build -f worker/Dockerfile -t scapes-worker .
FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

WORKDIR /app

COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stable Audio Open is gated → downloads at runtime (cache on a network volume via HF_HOME).
COPY worker/ /app

CMD ["python", "-u", "handler.py"]
