"use client";
import { useEffect, useRef } from "react";
import { CATEGORY_COLOR, type Clip, type PadState } from "@/lib/audio/types";
import { rippleOrb } from "@/lib/motion";

export function Pad({
  clip,
  state,
  hotkey,
  onTrigger,
}: {
  clip: Clip;
  state: PadState;
  hotkey?: string;
  onTrigger: () => void;
}) {
  const ring = useRef<HTMLSpanElement>(null);
  const prev = useRef<PadState>("idle");

  // Ripple at the moment of trigger (idle -> queued).
  useEffect(() => {
    if (prev.current === "idle" && state === "queued") rippleOrb(ring.current);
    prev.current = state;
  }, [state]);

  return (
    <div
      className="orb-wrap"
      style={{ "--orb": CATEGORY_COLOR[clip.category] } as React.CSSProperties}
    >
      <span ref={ring} className="orb-ring" aria-hidden />
      <button
        onClick={onTrigger}
        className={`orb orb-${state}`}
        aria-label={`${clip.category} pad (${state})`}
      >
        <span className="orb-label">{clip.category}</span>
        {hotkey && <span className="orb-key">{hotkey}</span>}
      </button>
    </div>
  );
}
