import * as Tone from "tone";
import type { Category } from "./types";

/** Deterministic PRNG seeded by clip id → a pack sounds the same every load. */
function seeded(id: string) {
  let h = 2166136261;
  for (const c of id) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)) >>> 0) / 2 ** 32;
}

/**
 * The "smart" part: each pad auto-gets an effect chain tuned to its category, so any
 * clip the user triggers blends in instead of sounding pasted on. Returns nodes to be
 * chained player -> ...fx -> master.
 */
export function buildAutoFXChain(category: Category, id: string): Tone.ToneAudioNode[] {
  const rng = seeded(id);
  const nodes: Tone.ToneAudioNode[] = [];

  // Tame piercing top-end AT THE SOURCE so a bright clip can never be painful — SAO ignores
  // "not harsh" prompts sometimes. The in-key synth already provides the pleasant sparkle.
  if (category === "high") {
    // Cut into the actual harsh/painful band (~2.5-5kHz, where the ear is most sensitive) —
    // a 5kHz cutoff sat above it and did nothing. Plus a peaking dip right on the sore spot.
    nodes.push(new Tone.Filter({ frequency: 2800, type: "lowpass", rolloff: -24 }));
    nodes.push(new Tone.Filter({ frequency: 3500, type: "peaking", Q: 1, gain: -12 }));
    nodes.push(new Tone.Gain(0.5)); // and noticeably quieter
  } else if (category === "earcandy") {
    nodes.push(new Tone.Filter({ frequency: 7000, type: "lowpass", rolloff: -12 }));
  }

  // Stereo width on everything except bass (keep the low foundation centered/mono).
  if (category !== "bass") nodes.push(new Tone.StereoWidener(0.35 + rng() * 0.4));

  // Slow shimmer on the pad-like atmospheric layers.
  if (["mid", "high", "voice"].includes(category)) {
    nodes.push(new Tone.Chorus(0.3 + rng(), 3.5, 0.4).start());
  }

  // Rhythmic delay on the one-shot accents (ear-candy + percussion).
  if (["earcandy", "perc"].includes(category)) {
    const dt = ["8n", "8n.", "4n"][Math.floor(rng() * 3)];
    const d = new Tone.PingPongDelay(dt, 0.22 + rng() * 0.18);
    d.wet.value = 0.28;
    nodes.push(d);
  }

  // (Removed the per-voice AutoPanner — 8 continuous LFOs were extra DSP for little gain.
  // The master reverb + per-clip width already give plenty of space.)
  return nodes;
}
