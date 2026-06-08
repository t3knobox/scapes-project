"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/state/store";
import { proceduralBackground } from "@/lib/background";

/**
 * Two-tier painted background:
 *  - bg-mesh: instant prompt-seeded gradient mesh (always works).
 *  - bg-img:  the AI depiction, fades in over the mesh once it loads; on error it's
 *             simply hidden and the mesh stays. A dark overlay keeps content legible.
 */
export function Background() {
  const url = useStore((s) => s.bgUrl);
  const prompt = useStore((s) => s.prompt);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [url]);

  return (
    <div className="bg-layer" aria-hidden>
      {prompt && (
        <div
          className="bg-mesh"
          style={{ background: proceduralBackground(prompt), backgroundColor: "#0a0a0a" }}
        />
      )}
      {url && !failed && (
        // Dynamic external URL → plain <img> (no next/image domain config needed).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className={`bg-img ${loaded ? "bg-img-in" : ""}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      <div className="bg-overlay" />
    </div>
  );
}
