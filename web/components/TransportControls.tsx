"use client";
import { useEffect } from "react";
import { useStore } from "@/state/store";
import { session } from "@/lib/audio/session";
import { fadeUp } from "@/lib/motion";

export function TransportControls() {
  const isPlaying = useStore((s) => s.isPlaying);
  const auto = useStore((s) => s.autoMode);
  const volume = useStore((s) => s.volume);
  const hasPack = useStore((s) => s.clips.length > 0);

  // Fade the bar up the first time it appears (after a pack loads).
  useEffect(() => {
    if (hasPack) fadeUp(".transportbar");
  }, [hasPack]);

  if (!hasPack) return null;

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
    </div>
  );
}
