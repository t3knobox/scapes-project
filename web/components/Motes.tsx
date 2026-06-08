"use client";
import { useEffect, useRef } from "react";
import { animate } from "animejs";

const N = 28;

/** White fireflies: anime.js drives slow drift (transform), CSS pulses the glow (opacity).
 *  Each one gets its own pulse duration + delay so they twinkle out of sync. */
export function Motes() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dots = ref.current?.querySelectorAll<HTMLElement>(".mote") ?? [];
    dots.forEach((d, i) => {
      const dir = i % 2 ? 1 : -1;
      animate(d, {
        translateX: dir * (16 + (i % 5) * 9),
        translateY: -(18 + (i % 4) * 15),
        duration: 7000 + (i % 6) * 1300,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        delay: i * 130,
      });
    });
  }, []);

  return (
    <div ref={ref} className="motes" aria-hidden>
      {Array.from({ length: N }).map((_, i) => {
        const size = 2 + (i % 3); // 2–4px
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
