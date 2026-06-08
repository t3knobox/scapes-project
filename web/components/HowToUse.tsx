"use client";
import { useState } from "react";

export function HowToUse() {
  const [open, setOpen] = useState(false);
  return (
    <div className="howto">
      <button className="howto-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg
          className="howto-icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
          <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />
        </svg>
        How to use
      </button>
      {open && (
        <div className="howto-panel" role="dialog" aria-label="How to use">
          <ol className="howto-steps">
            <li>
              <span>1</span>
              <div>
                Type a scene in the box and press <b>Generate</b> — the world paints itself.
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                Hit <b>▶ Play</b>. An ambient soundscape starts and keeps evolving on its own.
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                Tap the glowing <b>orbs</b> (or press keys <b>Q–P</b>) to layer in sounds — each
                one blends in by itself.
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                Turn on <b>✦ Auto</b> to let it play and evolve hands-free.
              </div>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
