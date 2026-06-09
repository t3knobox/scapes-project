"""Store + /soundscapes + /s/{slug} tests (RELIABILITY.md §5)."""
from app import main, store


def test_save_and_get_roundtrip():
    res = store.save_pack({"prompt": "p", "key": "D major", "bpm": 72, "clips": []})
    assert res["id"].startswith("pack_") and len(res["slug"]) == 10
    pack = store.get_pack_by_slug(res["slug"])
    assert pack["prompt"] == "p" and pack["id"] == res["id"]


def test_slugs_unique_and_opaque():
    slugs = {store.save_pack({"prompt": "x", "key": "C major", "bpm": 60, "clips": []})["slug"]
             for _ in range(50)}
    assert len(slugs) == 50                 # no collisions
    assert all(not s.isdigit() for s in slugs)   # not sequential integers


def test_find_done_hash_only_returns_done_jobs():
    assert store.find_done_job_by_hash("nope") is None
    store.jobs["j1"] = {"status": "done"}
    store.mark_done_hash("h1", "j1")
    assert store.find_done_job_by_hash("h1") == "j1"
    store.jobs["j2"] = {"status": "running"}
    store.mark_done_hash("h2", "j2")
    assert store.find_done_job_by_hash("h2") is None   # running job is not a cache hit


def test_save_rejects_foreign_clip_url(client):
    pack = {"prompt": "p", "key": "D major", "bpm": 72,
            "clips": [{"url": "https://evil.example.com/x.mp3"}]}
    r = client.post("/soundscapes", json=pack)
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "INVALID_CLIP_URL"


def test_save_accepts_cdn_url_and_share_resolves(client):
    pack = {"prompt": "p", "key": "D major", "bpm": 72,
            "clips": [{"url": main.CDN_BASE + "/packs/x/ambience_0.wav"}]}
    res = client.post("/soundscapes", json=pack).json()
    shared = client.get(f"/s/{res['slug']}").json()
    assert shared["prompt"] == "p" and shared["slug"] == res["slug"]


def test_save_accepts_data_uri_and_share_resolves(client):
    """The live path: clips are inline base64 data-URIs (no R2)."""
    pack = {"prompt": "forest", "key": "C major", "bpm": 68, "bgUrl": None,
            "clips": [{"category": "bass", "url": "data:audio/mpeg;base64,AAAA",
                       "durationSec": 12, "quantize": "free", "loop": True,
                       "key": "C major", "bpm": 68}]}
    res = client.post("/soundscapes", json=pack)
    assert res.status_code == 200
    shared = client.get(f"/s/{res.json()['slug']}").json()
    assert shared["prompt"] == "forest" and len(shared["clips"]) == 1
    assert shared["clips"][0]["url"].startswith("data:audio/")


def test_save_rejects_empty_pack(client):
    r = client.post("/soundscapes", json={"prompt": "p", "key": "C major", "bpm": 60, "clips": []})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "INVALID_PACK"


def test_share_unknown_slug_404(client):
    r = client.get("/s/nonexistent")
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "NOT_FOUND"
