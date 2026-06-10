"use client";

const N = 10;

/** White fireflies — PURE CSS: each one drifts (translate) + twinkles (opacity) entirely on
 *  the compositor, so there's zero per-frame JavaScript competing with the audio scheduler. */
export function Motes() {
  return (
    <div className="motes" aria-hidden>
      {Array.from({ length: N }).map((_, i) => {
        const size = 2 + (i % 3); // 2–4px
        const dir = i % 2 ? 1 : -1;
        return (
          <span
            key={i}
            className="mote"
            style={
              {
                left: `${(i * 47 + 11) % 100}%`,
                top: `${(i * 31 + 7) % 100}%`,
                width: `${size}px`,
                height: `${size}px`,
                "--tx": `${dir * (16 + (i % 5) * 9)}px`,
                "--ty": `${-(18 + (i % 4) * 15)}px`,
                "--drift-dur": `${7 + (i % 6) * 1.3}s`,
                "--dur": `${3.5 + (i % 5) * 0.8}s`,
                animationDelay: `${(i % 7) * 0.6}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
