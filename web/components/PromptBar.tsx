"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { session } from "@/lib/audio/session";
import { renderMockPack } from "@/lib/audio/mockPack";
import { fetchBackground } from "@/lib/background";
import { generateSoundscape } from "@/lib/generate";
import { HowToUse } from "./HowToUse";

// Flip to "1" in web/.env.local once the RunPod audio worker endpoint is live.
const USE_REAL_AUDIO = process.env.NEXT_PUBLIC_REAL_AUDIO === "1";

// Seeds for the "Surprise me" button — evocative + spread across the scene palettes.
const SURPRISE_PROMPTS = [
  "a misty forest at dawn with a stream",
  "drifting through deep space",
  "a snowed-in cabin by a crackling fire",
  "rain on a quiet café window",
  "a faded neon city at 3am",
  "an underwater cathedral",
  "ocean waves at sunrise",
  "a temple garden with wind chimes",
  "a thunderstorm rolling over the plains",
  "floating above the clouds at golden hour",
  "a moonlit desert, vast and still",
  "a cozy library on a rainy afternoon",
];

const ERROR_COPY: Record<string, string> = {
  PROMPT_EMPTY: "Describe a soundscape first.",
  PROMPT_TOO_LONG: "Keep it under 400 characters.",
  RATE_LIMITED: "Too many requests — wait a moment, then retry.",
  GEN_TIMEOUT: "That took too long — the worker may be cold-starting. Try again.",
  GEN_FAILED: "Audio generation hiccuped — the worker may be warming up. Give it another go.",
  NETWORK: "Can't reach the server — is the backend running? Try again.",
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PromptBar() {
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const loading = useStore((s) => s.loading);
  const hasPack = useStore((s) => s.clips.length > 0);

  // Tick an elapsed timer while generating — reassures during the cold-start wait.
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  function surprise() {
    const opts = SURPRISE_PROMPTS.filter((p) => p !== text);
    setText(opts[Math.floor(Math.random() * opts.length)] ?? SURPRISE_PROMPTS[0]);
  }

  async function generate() {
    const store = useStore.getState();
    setError(null);
    setProgress(0);
    store.setPrompt(text); // mesh paints instantly
    store.setBg(null);
    fetchBackground(text).then((url) => url && store.setBg(url)); // image in parallel

    store.setLoading(true);
    try {
      const pack = USE_REAL_AUDIO
        ? await generateSoundscape(text, (p) => setProgress(p.progress))
        : await renderMockPack();
      await session.loadPack(pack.clips, pack.key, pack.bpm);
    } catch (e) {
      const code = e instanceof Error ? e.message : "GEN_FAILED";
      setError(ERROR_COPY[code] ?? ERROR_COPY.GEN_FAILED);
    } finally {
      store.setLoading(false);
      setProgress(0);
    }
  }

  const statusText =
    progress > 0
      ? `Generating soundscape… ${progress}%`
      : "Waking the sound engine… first run can take a few minutes ✨";

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-3">
      <div className="w-full flex gap-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a world…"
          className="prompt-input"
          disabled={loading}
          onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
        />
        <button
          className="transport-btn btn-invert whitespace-nowrap"
          onClick={generate}
          disabled={loading}
        >
          {loading ? "Generating…" : hasPack ? "Regenerate" : "Generate"}
        </button>
      </div>

      <div className="prompt-controls">
        <HowToUse />
        <button className="howto-btn" onClick={surprise} disabled={loading} title="Fill the box with a random idea">
          <span aria-hidden>✦</span> Surprise me
        </button>
      </div>

      {loading && (
        <div className="gen-loading">
          <div className="gen-status">
            <span>{statusText}</span>
            <span className="gen-elapsed">{fmt(elapsed)}</span>
          </div>
          <div className="gen-bar">
            <div
              className={`gen-bar-fill ${progress > 0 ? "" : "gen-bar-indeterminate"}`}
              style={progress > 0 ? { width: `${progress}%` } : undefined}
            />
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="gen-error" role="alert">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
          </svg>
          <span>{error}</span>
          <button className="gen-retry" onClick={generate}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
