import { parseKey } from "./harmony";

// The target scale: which semitones (from the root) are "in key". Everything tonal snaps here.
const SCALE_SEMIS: Record<"ionian" | "aeolian", number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11], // major
  aeolian: [0, 2, 3, 5, 7, 8, 10], // natural minor
};

export type Scale = { rootMidi: number; semis: number[] };

export function getScale(key: string): Scale {
  const { rootMidi, mode } = parseKey(key);
  return { rootMidi, semis: SCALE_SEMIS[mode] };
}

/** Scale-degree index (0 = root; 7 = root an octave up; negatives ok) -> MIDI note. */
export function degreeToMidi(scale: Scale, degree: number): number {
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return scale.rootMidi + scale.semis[idx] + 12 * oct;
}

/** Octave-shift a midi note so it lands nearest `nearMidi` — keeps the sampler's resampling
 *  shift within ~6 semitones of the actual sample pitch, so the timbre never warps. */
export function nearestOctave(midi: number, nearMidi: number): number {
  let m = midi;
  while (m - nearMidi > 6) m -= 12;
  while (nearMidi - m > 6) m += 12;
  return m;
}

// What each tonal pad plays off the piano roll (scale-degree indices). Richer than single notes;
// kept within ~an octave so the close voicing resamples cleanly. perc/environmental stay raw.
export const CATEGORY_DEGREES: Record<string, number[]> = {
  bass: [0, 4], // root + fifth
  mid: [0, 2, 4], // tonic triad
  high: [4, 7, 9], // airy upper scale tones
  voice: [0, 4], // root + fifth (distinct — [0,7] collapsed to a unison after octave-placement)
  earcandy: [0, 2, 4, 7], // arpeggiated sparkle
};
export const TONAL_CATEGORIES = new Set(Object.keys(CATEGORY_DEGREES));
export const ARP_CATEGORIES = new Set(["earcandy"]);
