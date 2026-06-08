// Shared audio types. No Tone runtime import here (type-only) so this is SSR-safe.
export type Category = "ambience" | "texture" | "lead" | "bass" | "perc" | "vocal";
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
  ambience: "#7c83ff",
  texture: "#3fd1c7",
  lead: "#5ad1ff",
  bass: "#3b5bdb",
  perc: "#ffcf6b",
  vocal: "#c08bff",
};
