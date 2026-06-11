// Autocorrelation pitch detection — reliable on monophonic sustained tones, which is the
// whole reason we force single-note samples. Validated numerically (see git history /
// _pitchtest.mjs): a clean tone reports confidence ~1.0, a chord ~0.76, noise ~0.02, so a
// confidence gate cleanly accepts single notes and rejects chords/noise.

export type PitchResult = { midi: number; freq: number; confidence: number };

/** Confidence below this = no clear single pitch (chord or noise) → don't sample it. */
export const PITCH_CONFIDENCE_MIN = 0.85;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** MIDI note number → scientific note name (e.g. 57 → "A3"), for Tone.Sampler maps. */
export function midiToNote(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/**
 * The frequency to feed a Tone.Sampler (whose buffer is mapped at `baseMidi` but whose TRUE
 * pitch is `detectedFreq`) so the output lands exactly on `targetMidi`'s concert-pitch (12-TET).
 * This is the cents-correction: SAO isn't at A=440, so without it everything is detuned.
 */
export function correctedFreq(targetMidi: number, baseMidi: number, detectedFreq: number): number {
  const trueBaseFreq = 440 * Math.pow(2, (baseMidi - 69) / 12);
  const tuneRatio = trueBaseFreq / detectedFreq; // sample's off-concert error
  const targetFreq = 440 * Math.pow(2, (targetMidi - 69) / 12);
  return targetFreq * tuneRatio;
}

/**
 * Estimate the dominant pitch of a mono PCM buffer. Returns null on silence.
 * `confidence` (0..1) is the normalized autocorrelation at the fundamental — gate on
 * PITCH_CONFIDENCE_MIN to use only clips that are genuinely a single note.
 */
export function detectPitch(data: Float32Array, sampleRate: number): PitchResult | null {
  const n = data.length;
  if (n < 2048) return null;
  const start = Math.floor(n * 0.3); // skip the attack, analyse the steady state
  const size = Math.min(16384, n - start);
  const buf = data.subarray(start, start + size);

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.005) return null; // silence

  const minLag = Math.floor(sampleRate / 1000); // search 50–1000 Hz
  const maxLag = Math.floor(sampleRate / 50);

  const corr = new Float32Array(maxLag + 2);
  let gmax = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < size - lag; i++) c += buf[i] * buf[i + lag];
    c /= size - lag;
    corr[lag] = c;
    if (c > gmax) gmax = c;
  }
  if (gmax <= 0) return null;

  // First local peak above 85% of the global max = the true fundamental (shortest period).
  // Taking the global max instead locks onto subharmonics → octave-down errors.
  const thresh = 0.85 * gmax;
  let bestLag = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= thresh && corr[lag] >= corr[lag - 1] && corr[lag] > corr[lag + 1]) {
      bestLag = lag;
      break;
    }
  }
  if (bestLag <= 0) return null;

  // Parabolic interpolation around the peak → sub-sample (sub-cent) accuracy.
  const y0 = corr[bestLag - 1];
  const y1 = corr[bestLag];
  const y2 = corr[bestLag + 1];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom ? (0.5 * (y0 - y2)) / denom : 0;
  const freq = sampleRate / (bestLag + shift);
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const confidence = Math.max(0, Math.min(1, corr[bestLag] / (rms * rms)));
  return { midi, freq, confidence };
}
