"use client";
import { useEffect, useRef } from "react";
import { engine } from "@/lib/audio/engine";

/**
 * Central halo that scales + brightens with the live master output. Reads the engine
 * meter on a rAF loop and writes a CSS var (--level) — no React re-renders in the path.
 * rAF (not anime.js) is the right tool for a continuous signal-driven value.
 */
export function AudioAura() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    let frame = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (frame++ % 2) return; // ~30fps is plenty for a glow; halves the main-thread work
      const v = engine.getLevel();
      smooth += (v - smooth) * 0.3;
      ref.current?.style.setProperty("--level", smooth.toFixed(3));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <div ref={ref} className="aura" aria-hidden />;
}
