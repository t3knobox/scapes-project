"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { session } from "@/lib/audio/session";
import { fadeUp } from "@/lib/motion";
import { packToSave, saveScape } from "@/lib/share";

export function TransportControls() {
  const isPlaying = useStore((s) => s.isPlaying);
  const auto = useStore((s) => s.autoMode);
  const volume = useStore((s) => s.volume);
  const clips = useStore((s) => s.clips);
  const hasPack = clips.length > 0;

  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Fade the bar up the first time it appears (after a pack loads).
  useEffect(() => {
    if (hasPack) fadeUp(".transportbar");
  }, [hasPack]);

  // A new/regenerated pack invalidates any previous share link.
  useEffect(() => {
    setShareUrl(null);
    setSaveErr(null);
    setCopied(false);
  }, [clips]);

  if (!hasPack) return null;

  async function save() {
    setSaving(true);
    setSaveErr(null);
    try {
      const s = useStore.getState();
      const pack = packToSave(s.prompt, s.keyName, s.bpm, s.bgUrl, s.clips);
      if (!pack) throw new Error("CANT_SAVE");
      const { slug } = await saveScape(pack);
      setShareUrl(`${window.location.origin}/s/${slug}`);
    } catch {
      setSaveErr("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="transportbar flex flex-col items-center gap-4">
      <div className="flex items-center gap-4">
        <button
          className="transport-btn"
          onClick={() => (isPlaying ? session.stop() : session.play())}
        >
          {isPlaying ? "■ Stop" : "▶ Play"}
        </button>
        <button
          className={`transport-btn ${auto ? "transport-on" : ""}`}
          onClick={() => session.setAuto(!auto)}
          disabled={!isPlaying}
          title={isPlaying ? "" : "Press Play first"}
        >
          ✦ Auto {auto ? "On" : "Off"}
        </button>
        <button
          className="transport-btn"
          onClick={save}
          disabled={saving}
          title="Save & get a shareable link"
        >
          {saving ? "Saving…" : shareUrl ? "✓ Saved" : "⤴ Share"}
        </button>
      </div>

      <label className="vol">
        <span className="vol-icon" aria-hidden>
          ◂))
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => session.setVolume(parseFloat(e.target.value))}
          aria-label="Volume"
        />
      </label>

      {shareUrl && (
        <div className="share-row">
          <input
            className="share-link"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Shareable link"
          />
          <button className="share-copy" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
      {saveErr && <p className="share-err">{saveErr}</p>}
    </div>
  );
}
