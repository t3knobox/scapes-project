"""In-memory job + pack store (RELIABILITY.md §5).

MVP only — single replica. The function interface is what main.py depends on, so
swapping to Redis (jobs) + Postgres (packs) later is a drop-in. Call reset() in tests.
"""
from __future__ import annotations

import secrets
import string

_ALPHABET = string.ascii_letters + string.digits  # base62 → opaque, non-sequential slugs

jobs: dict[str, dict] = {}            # job_id -> job dict
_packs: dict[str, dict] = {}          # pack_id -> pack dict
_slugs: dict[str, str] = {}           # slug -> pack_id
_done_hash: dict[str, str] = {}       # request_hash -> job_id (only set when job is done)


def reset() -> None:
    jobs.clear()
    _packs.clear()
    _slugs.clear()
    _done_hash.clear()


# ---- dedupe index ----------------------------------------------------------
def find_done_job_by_hash(h: str) -> str | None:
    jid = _done_hash.get(h)
    if jid and jobs.get(jid, {}).get("status") == "done":
        return jid
    return None


def mark_done_hash(h: str, job_id: str) -> None:
    _done_hash[h] = job_id


# ---- packs / sharing -------------------------------------------------------
def _new_slug() -> str:
    while True:
        s = "".join(secrets.choice(_ALPHABET) for _ in range(10))
        if s not in _slugs:
            return s


def save_pack(pack: dict) -> dict:
    pid = "pack_" + secrets.token_hex(6)
    slug = _new_slug()
    _packs[pid] = {**pack, "id": pid, "slug": slug}
    _slugs[slug] = pid
    return {"id": pid, "slug": slug}


def get_pack(pid: str) -> dict | None:
    return _packs.get(pid)


def get_pack_by_slug(slug: str) -> dict | None:
    pid = _slugs.get(slug)
    return _packs.get(pid) if pid else None
