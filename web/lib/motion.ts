// anime.js (v4) motion choreography. Imported only by client components rendered
// under the ssr:false Studio, so it never runs on the server.
import { animate, stagger, remove } from "animejs";

/** Page-load: ASCII banner reveals line-by-line (terminal feel), then kicker/subtitle/prompt. */
export function entranceHeader() {
  animate(".ascii-line", {
    opacity: [0, 1],
    translateX: [-14, 0],
    duration: 700,
    ease: "outExpo",
    delay: stagger(85, { start: 150 }),
  });
  animate(".title-kicker", { opacity: [0, 0.8], duration: 900, ease: "outExpo", delay: 650 });
  animate(".promptbar", { opacity: [0, 1], translateY: [16, 0], duration: 900, ease: "outExpo", delay: 800 });
}

/** Generic fade-up for elements that appear later (e.g. the transport bar). */
export function fadeUp(selector: string) {
  animate(selector, { opacity: [0, 1], translateY: [14, 0], duration: 800, ease: "outExpo" });
}

/**
 * Orbs spring in on a stagger, then settle into a continuous out-of-phase "breathing"
 * float. remove() first so a regenerate doesn't stack a second breathing loop.
 * Note: float is on .orb-wrap (translateY) while the inner .orb keeps its CSS state
 * transforms (scale/glow) — separate layers, no conflict.
 */
export function entranceOrbsAndBreathe() {
  remove(".orb-wrap");
  animate(".orb-wrap", {
    opacity: [0, 1],
    scale: [0.5, 1],
    translateY: [26, 0],
    duration: 820,
    ease: "outBack",
    delay: stagger(70),
    onComplete: () => {
      animate(".orb-wrap", {
        translateY: [-6, 6],
        duration: 3400,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        delay: stagger(240), // phase offset → orbs breathe out of sync (organic)
      });
    },
  });
}

/** Expanding ring at the moment a pad is triggered. */
export function rippleOrb(el: Element | null) {
  if (!el) return;
  animate(el, { scale: [1, 2], opacity: [0.55, 0], duration: 950, ease: "outExpo" });
}
