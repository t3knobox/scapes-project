"""Loads backend/.env into the environment. Imported FIRST in main.py (and tests'
scripts) so RUNPOD_API_KEY / ANTHROPIC_API_KEY are present before any module reads them."""
from pathlib import Path

from dotenv import load_dotenv

# backend/.env (app/ -> backend/)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
