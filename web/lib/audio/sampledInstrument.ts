import * as Tone from "tone";
import { midiToNote, correctedFreq } from "./pitch";

/**
 * A tiny playable instrument built from one detected-pitch sample: a Tone.Sampler that plays
 * arbitrary MIDI notes, each cents-corrected onto 12-TET so an off-concert SAO clip still hits
 * the exact scale tones. This is "the sample laid across the piano roll."
 */
export class SampledInstrument {
  private sampler: Tone.Sampler;

  constructor(
    buffer: AudioBuffer,
    private baseMidi: number,
    private detectedFreq: number,
    out: Tone.InputNode,
    opts: { attack?: number; release?: number; volume?: number } = {},
  ) {
    this.sampler = new Tone.Sampler({
      urls: { [midiToNote(baseMidi)]: buffer },
      attack: opts.attack ?? 0.6,
      release: opts.release ?? 1.6,
      volume: opts.volume ?? -8,
    });
    this.sampler.connect(out);
  }

  private freqs(midis: number[]) {
    return midis.map((m) => correctedFreq(m, this.baseMidi, this.detectedFreq));
  }

  /** Sustain a voicing until release() (loops) or for the caller to release (one-shots). */
  attack(midis: number[], time?: Tone.Unit.Time, vel = 0.8) {
    this.sampler.triggerAttack(this.freqs(midis), time, vel);
  }

  release(midis: number[], time?: Tone.Unit.Time) {
    this.sampler.triggerRelease(this.freqs(midis), time);
  }

  /** Play the notes as a quick staggered arpeggio (ear-candy). */
  arp(midis: number[], startSec: number, step = 0.16, dur = 0.45, vel = 0.7) {
    midis.forEach((m, i) => {
      this.sampler.triggerAttackRelease(
        correctedFreq(m, this.baseMidi, this.detectedFreq),
        dur,
        startSec + i * step,
        vel,
      );
    });
  }

  releaseAll(time?: Tone.Unit.Time) {
    this.sampler.releaseAll(time);
  }

  dispose() {
    try {
      this.sampler.dispose();
    } catch {
      /* noop */
    }
  }
}
