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
 * Orbs spring in on a stagger (one-shot). The continuous "breathing" float is a CSS
 * animation (`orbBreathe` on .orb-wrap, using the independent `translate` property so it
 * composes with this entrance's transform) — kept off the main thread for audio smoothness.
 * remove() first so a regenerate doesn't stack a second entrance.
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
  });
}

/** Expanding ring at the moment a pad is triggered. */
export function rippleOrb(el: Element | null) {
  if (!el) return;
  animate(el, { scale: [1, 2], opacity: [0.55, 0], duration: 950, ease: "outExpo" });
}
