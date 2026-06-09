"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Background } from "./Background";
import { Motes } from "./Motes";
import { AudioAura } from "./AudioAura";
import { TitleAscii } from "./TitleAscii";
import { PadGrid } from "./PadGrid";
import { TransportControls } from "./TransportControls";
import { useStore } from "@/state/store";
import { session } from "@/lib/audio/session";
import { fetchScape, scapeToClips } from "@/lib/share";
import { entranceHeader } from "@/lib/motion";

// Loaded via next/dynamic ssr:false (see app/s/[slug]/page.tsx) — Tone.js stays off the server.
export function ShareStudio({ slug }: { slug: string }) {
  const generated = useStore((s) => s.clips.length > 0);
  const prompt = useStore((s) => s.prompt);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");

  useEffect(() => {
    entranceHeader();
    let cancelled = false;
    (async () => {
      try {
        const scape = await fetchScape(slug);
        if (cancelled) return;
        const store = useStore.getState();
        store.setPrompt(scape.prompt);
        store.setBg(scape.bgUrl ?? null);
        await session.loadPack(scapeToClips(scape), scape.key, scape.bpm);
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("notfound");
      }
    })();
    return () => {
      cancelled = true;
      session.dispose();
    };
  }, [slug]);

  if (status === "notfound") {
    return (
      <main className="relative min-h-screen flex flex-col items-center justify-center gap-6 px-6">
        <Background />
        <p className="z-10 text-[#9a9ab5]">This scape doesn’t exist (or has expired).</p>
        <Link href="/" className="transport-btn z-10">
          Create your own ↗
        </Link>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center gap-9 px-6 py-16">
      <Background />
      <Motes />
      {generated && <AudioAura />}

      <header className="text-center z-10 flex flex-col items-center">
        <TitleAscii />
      </header>

      <div className="z-10 text-center max-w-xl">
        {prompt && <p className="share-caption">“{prompt}”</p>}
      </div>

      <div className="z-10">
        <PadGrid />
      </div>
      <div className="z-10">
        <TransportControls />
      </div>

      <Link href="/" className="share-cta z-10">
        ✦ Create your own scape
      </Link>
    </main>
  );
}
