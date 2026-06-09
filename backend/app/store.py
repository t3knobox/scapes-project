"""Job + pack store (RELIABILITY.md §5).

Jobs + the dedupe index stay in-memory (ephemeral — swap to Redis at scale).
Packs persist to SQLite so saved/shared scapes survive a restart; the function
interface is unchanged so this becomes Postgres/Supabase at scale as a drop-in.
DB path: env SCAPES_DB (":memory:" in tests) or <backend>/data/scapes.db. Call reset() in tests.
"""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import string
import time
from pathlib import Path

_ALPHABET = string.ascii_letters + string.digits  # base62 → opaque, non-sequential slugs

jobs: dict[str, dict] = {}            # job_id -> job dict (ephemeral)
_done_hash: dict[str, str] = {}       # request_hash -> job_id (only set when job is done)

_conn: sqlite3.Connection | None = None


def _db() -> sqlite3.Connection:
    """Lazily open one shared connection (so a ":memory:" db persists for the process)."""
    global _conn
    if _conn is None:
        path = os.environ.get("SCAPES_DB")
        if not path:
            d = Path(__file__).resolve().parent.parent / "data"
            d.mkdir(exist_ok=True)
            path = str(d / "scapes.db")
        _conn = sqlite3.connect(path, check_same_thread=False)
        _conn.execute(
            "CREATE TABLE IF NOT EXISTS packs "
            "(id TEXT PRIMARY KEY, slug TEXT UNIQUE, data TEXT, last_accessed REAL)"
        )
        # Migrate dbs that predate last_accessed; backfill existing rows to now.
        try:
            _conn.execute("ALTER TABLE packs ADD COLUMN last_accessed REAL")
        except sqlite3.OperationalError:
            pass  # column already exists
        _conn.execute(
            "UPDATE packs SET last_accessed = ? WHERE last_accessed IS NULL", (time.time(),)
        )
        _conn.commit()
    return _conn


def reset() -> None:
    jobs.clear()
    _done_hash.clear()
    _db().execute("DELETE FROM packs")
    _db().commit()


# ---- dedupe index ----------------------------------------------------------
def find_done_job_by_hash(h: str) -> str | None:
    jid = _done_hash.get(h)
    if jid and jobs.get(jid, {}).get("status") == "done":
        return jid
    return None


def mark_done_hash(h: str, job_id: str) -> None:
    _done_hash[h] = job_id


# ---- packs / sharing (persistent) ------------------------------------------
def _new_slug() -> str:
    while True:
        s = "".join(secrets.choice(_ALPHABET) for _ in range(10))
        if not _db().execute("SELECT 1 FROM packs WHERE slug = ?", (s,)).fetchone():
            return s


def save_pack(pack: dict) -> dict:
    pid = "pack_" + secrets.token_hex(6)
    slug = _new_slug()
    full = {**pack, "id": pid, "slug": slug}
    _db().execute(
        "INSERT INTO packs (id, slug, data, last_accessed) VALUES (?, ?, ?, ?)",
        (pid, slug, json.dumps(full), time.time()),
    )
    _db().commit()
    return {"id": pid, "slug": slug}


def get_pack(pid: str) -> dict | None:
    row = _db().execute("SELECT data FROM packs WHERE id = ?", (pid,)).fetchone()
    return json.loads(row[0]) if row else None


def get_pack_by_slug(slug: str) -> dict | None:
    row = _db().execute("SELECT data FROM packs WHERE slug = ?", (slug,)).fetchone()
    if not row:
        return None
    # "Link used" → keep it alive for another TTL window.
    _db().execute("UPDATE packs SET last_accessed = ? WHERE slug = ?", (time.time(), slug))
    _db().commit()
    return json.loads(row[0])


def sweep_stale(cutoff_ts: float) -> int:
    """Delete packs whose share link hasn't been opened since cutoff_ts. Returns count removed."""
    cur = _db().execute("DELETE FROM packs WHERE last_accessed < ?", (cutoff_ts,))
    _db().commit()
    return cur.rowcount
