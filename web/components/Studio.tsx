"use client";
import { useEffect, useState } from "react";
import { Background } from "./Background";
import { Motes } from "./Motes";
import { AudioAura } from "./AudioAura";
import { TitleAscii } from "./TitleAscii";
import { PromptBar } from "./PromptBar";
import { PadGrid } from "./PadGrid";
import { TransportControls } from "./TransportControls";
import { DebugPanel } from "./DebugPanel";
import { useStore } from "@/state/store";
import { entranceHeader } from "@/lib/motion";

// Loaded via next/dynamic ssr:false (see app/page.tsx) so Tone.js never runs on the server.
export function Studio() {
  // Starts blank + dark; the decorative/audio-reactive layers appear once a world exists.
  const generated = useStore((s) => s.clips.length > 0);
  // ?still — A/B perf test: drop the motes/aura + disable CSS animation (see .still in globals.css).
  const [still] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("still"),
  );

  useEffect(() => {
    entranceHeader();
  }, []);

  return (
    <main
      className={`relative min-h-screen flex flex-col items-center justify-center gap-9 px-6 py-16 ${still ? "still" : ""}`}
    >
      <Background />
      {!still && <Motes />}
      {generated && !still && <AudioAura />}

      <header className="text-center z-10 flex flex-col items-center">
        <TitleAscii />
      </header>

      <div className="promptbar z-10 w-full flex flex-col items-center gap-4">
        <PromptBar />
      </div>
      <div className="z-10">
        <PadGrid />
      </div>
      <div className="z-10">
        <TransportControls />
      </div>
      <DebugPanel />
    </main>
  );
}
