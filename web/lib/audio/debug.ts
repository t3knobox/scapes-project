import * as Tone from "tone";
import { detectPitch, midiToNote, correctedFreq } from "./pitch";

// Pipeline verification: every tonal instrument registers its source pitch + the in-key notes it
// intends to play. verifyAll() then OFFLINE-renders each note (dry) through the same cents-corrected
// sampler and RE-DETECTS the output pitch — so we can compare intended vs actual and see the cents
// error. Catches bad source detection / resampling drift that the math alone hides.

export type DebugEntry = {
  label: string; // e.g. 'chord-bed', 'pad:bass'
  baseMidi: number; // the rounded detected note the sample is mapped at
  detectedFreq: number; // the sample's measured true pitch
  conf: number; // source detection confidence
  buffer: AudioBuffer;
  targets: number[]; // the in-key MIDI notes it should play
};

export type VerifyRow = {
  label: string;
  source: string;
  conf: number;
  target: string;
  output: string;
  cents: number | null; // output vs target, in cents (0 = perfect)
};

const entries: DebugEntry[] = [];
const logs: string[] = [];

export function debugEnabled(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
}

export function clearDebug() {
  entries.length = 0;
}

export function registerInstrument(e: DebugEntry) {
  if (debugEnabled()) entries.push(e);
}

/** Render each registered note dry through its sampler and re-detect the output pitch. */
export async function verifyAll(): Promise<VerifyRow[]> {
  const rows: VerifyRow[] = [];
  for (const e of entries) {
    for (const t of e.targets) {
      const fed = correctedFreq(t, e.baseMidi, e.detectedFreq);
      let outFreq: number | null = null;
      let outMidi = 0;
      try {
        const rendered = await Tone.Offline(() => {
          const s = new Tone.Sampler({ urls: { [midiToNote(e.baseMidi)]: e.buffer } }).toDestination();
          s.triggerAttackRelease(fed, 1.4, 0.05);
        }, 1.6);
        const ab = rendered.get();
        const res = ab ? detectPitch(ab.getChannelData(0), ab.sampleRate) : null;
        if (res) {
          outFreq = res.freq;
          outMidi = res.midi;
        }
      } catch {
        /* render failed → leave as null */
      }
      const targetFreq = 440 * Math.pow(2, (t - 69) / 12);
      const cents = outFreq ? Math.round(1200 * Math.log2(outFreq / targetFreq)) : null;
      rows.push({
        label: e.label,
        source: midiToNote(e.baseMidi),
        conf: e.conf,
        target: `${midiToNote(t)} (${targetFreq.toFixed(1)}Hz)`,
        output: outFreq ? `${midiToNote(outMidi)} (${outFreq.toFixed(1)}Hz)` : "—",
        cents,
      });
    }
  }
  return rows;
}

/** Mirror console.log into an on-page buffer so we don't need F12. */
export function captureLogs() {
  if (!debugEnabled()) return;
  const c = console as unknown as { log: (...a: unknown[]) => void; __scapesPatched?: boolean };
  if (c.__scapesPatched) return;
  const orig = c.log.bind(console);
  c.log = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    orig(...args);
  };
  c.__scapesPatched = true;
}

export function getLogs(): string[] {
  return logs;
}
