"use client";
import { useEffect } from "react";
import { useStore } from "@/state/store";
import { session } from "@/lib/audio/session";
import { keyToIndex, KEY_ROW } from "@/lib/audio/keymap";
import { entranceOrbsAndBreathe } from "@/lib/motion";
import { Pad } from "./Pad";

export function PadGrid() {
  const clips = useStore((s) => s.clips);
  const padState = useStore((s) => s.padState);
  const pads = clips; // every generated clip is a playable pad (synth handles the bed)

  // Animate orbs in (and start breathing) whenever a new pack loads. Depend on `clips`
  // identity (setClips makes a fresh array each load) so a regenerate re-runs it.
  useEffect(() => {
    if (pads.length) entranceOrbsAndBreathe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // One window listener; fires synchronously, no React state in the hot path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // ignore key-hold autofire
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return; // don't fire while typing
      const i = keyToIndex(e.key);
      if (i !== null && i < pads.length) session.triggerByIndex(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pads.length]);

  if (!pads.length) return null;
  const n = pads.length;

  return (
    <div className="pad-ring">
      <div className="pad-ring-core" aria-hidden />
      {pads.map((c, i) => {
        // Evenly distribute on a circle, starting at the top, going clockwise.
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return (
          <div
            key={c.id}
            className="orb-slot"
            style={
              { "--x": Math.cos(a).toFixed(4), "--y": Math.sin(a).toFixed(4) } as React.CSSProperties
            }
          >
            <Pad
              clip={c}
              state={padState[c.id] ?? "idle"}
              hotkey={KEY_ROW[i]?.toUpperCase()}
              onTrigger={() => session.triggerByIndex(i)}
            />
          </div>
        );
      })}
    </div>
  );
}
