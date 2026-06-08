"use client";
import { useState } from "react";
import { useStore } from "@/state/store";
import { session } from "@/lib/audio/session";
import { renderMockPack } from "@/lib/audio/mockPack";
import { fetchBackground } from "@/lib/background";
import { generateSoundscape } from "@/lib/generate";

// Flip to "1" in web/.env.local once the RunPod audio worker endpoint is live.
const USE_REAL_AUDIO = process.env.NEXT_PUBLIC_REAL_AUDIO === "1";

const ERROR_COPY: Record<string, string> = {
  PROMPT_EMPTY: "Describe a soundscape first.",
  PROMPT_TOO_LONG: "Keep it under 400 characters.",
  RATE_LIMITED: "Slow down a moment ✨",
  GEN_TIMEOUT: "Generation took too long — try again.",
  GEN_FAILED: "Something went wrong generating audio.",
};

export function PromptBar() {
  const [text, setText] = useState(
    "floating through misty ancient forests at dawn with gentle chimes",
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const loading = useStore((s) => s.loading);
  const hasPack = useStore((s) => s.clips.length > 0);

  async function generate() {
    const store = useStore.getState();
    setError(null);
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

  const label = loading
    ? USE_REAL_AUDIO && progress > 0
      ? `${progress}%`
      : "…"
    : hasPack
      ? "Regenerate"
      : "Generate";

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-2">
      <div className="w-full flex gap-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe a world…"
          className="prompt-input"
          onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
        />
        <button
          className="transport-btn btn-invert whitespace-nowrap"
          onClick={generate}
          disabled={loading}
        >
          {label}
        </button>
      </div>
      {error && <p className="prompt-error">{error}</p>}
    </div>
  );
}
