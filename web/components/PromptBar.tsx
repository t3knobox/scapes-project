"use client";
import { useState } from "react";
import { useStore } from "@/state/store";
import { session } from "@/lib/audio/session";
import { renderMockPack } from "@/lib/audio/mockPack";
import { fetchBackground } from "@/lib/background";

/**
 * Step-1: "Generate" paints the background from the prompt (Pollinations) and renders
 * the procedural MOCK audio pack (no backend, no GPU). When the backend is wired, swap
 * renderMockPack() for: POST /generate -> poll /jobs -> load clip URLs; and swap
 * backgroundUrl() for the backend's generated-image route. Component shape is unchanged.
 */
export function PromptBar() {
  const [text, setText] = useState(
    "floating through misty ancient forests at dawn with gentle chimes",
  );
  const loading = useStore((s) => s.loading);
  const hasPack = useStore((s) => s.clips.length > 0);

  async function generate() {
    const store = useStore.getState();
    store.setPrompt(text); // mesh paints instantly from the prompt
    store.setBg(null); // clear any previous image
    // Fetch the AI background in parallel — non-blocking; mesh covers the wait/failure.
    fetchBackground(text).then((url) => {
      if (url) store.setBg(url);
    });
    const { clips, key, bpm } = await renderMockPack();
    await session.loadPack(clips, key, bpm);
  }

  return (
    <div className="w-full max-w-xl flex gap-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe a world…"
        className="prompt-input"
        onKeyDown={(e) => e.key === "Enter" && !loading && generate()}
      />
      <button className="transport-btn btn-invert whitespace-nowrap" onClick={generate} disabled={loading}>
        {loading ? "…" : hasPack ? "Regenerate" : "Generate"}
      </button>
    </div>
  );
}
