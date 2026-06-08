// Shared audio types. No Tone runtime import here (type-only) so this is SSR-safe.
// Generated "character" layer only — the synth bed (chords/bass/key-jabs) is separate.
export type Category = "texture" | "environmental" | "earcandy" | "perc";
export type PadState = "idle" | "queued" | "playing";

export type Clip = {
  id: string;
  category: Category;
  /** A URL (production) or a pre-rendered buffer (mock pack). Tone.Player accepts both. */
  src: string | AudioBuffer | import("tone").ToneAudioBuffer;
  durationSec: number;
  quantize: "soft" | "free";
  loop: boolean;
  key: string;
  bpm: number;
};

export const CATEGORY_COLOR: Record<Category, string> = {
  texture: "#3fd1c7", // teal — atmospheric pads
  environmental: "#6fd17a", // green — nature/field recordings
  earcandy: "#ffcf6b", // gold — sparkles & sound design
  perc: "#c08bff", // lavender — percussion hits
};
