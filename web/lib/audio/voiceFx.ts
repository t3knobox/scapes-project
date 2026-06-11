import * as Tone from "tone";
import { buildAutoFXChain } from "./fx";
import { engine } from "./engine";
import type { Category } from "./types";

// Base reverb-send per category — the "middle" vibe: atmospheric, not drowned. Bass stays dry +
// grounded; airy layers (high/ear-candy/voice) sit further back in the space.
const REVERB_BASE: Record<string, number> = {
  bass: 0.12,
  mid: 0.4,
  high: 0.6,
  voice: 0.55,
  environmental: 0.45,
  earcandy: 0.6,
  perc: 0.3,
};

/**
 * Per-voice effects rack: the category's tone-shaping (buildAutoFXChain) → pan → dry out, plus a
 * parallel reverb SEND into the shared space. randomize() nudges send depth + stereo position on
 * every trigger so no two hits are alike. It only moves SPACE/POSITION — never pitch — so a
 * pitched voice can't drift off-key. Voices feed `input`.
 */
export class VoiceFX {
  readonly input: Tone.Gain;
  private autopan: Tone.AutoPanner;
  private revSend: Tone.Gain;
  private catFx: Tone.ToneAudioNode[];
  private base: number;

  constructor(category: Category, id: string) {
    this.base = REVERB_BASE[category] ?? 0.18;
    this.input = new Tone.Gain(1);
    this.catFx = buildAutoFXChain(category, id);
    // continuous auto-pan → the sound sweeps across the stereo field (obvious, dreamy motion)
    this.autopan = new Tone.AutoPanner({ frequency: 0.15 + Math.random() * 0.3, depth: 1 }).start();
    this.input.chain(...this.catFx, this.autopan);
    this.autopan.connect(engine.master); // dry path (panned)
    this.revSend = new Tone.Gain(this.base);
    this.autopan.connect(this.revSend);
    this.revSend.connect(engine.spaceReverb); // wet send
  }

  /** Tasteful per-trigger variation — shift reverb depth + stereo position (pitch untouched). */
  randomize() {
    const depth = Math.max(0, Math.min(0.95, this.base + (Math.random() - 0.5) * 0.5));
    this.revSend.gain.rampTo(depth, 0.12, "+0.02");
    this.autopan.frequency.rampTo(0.1 + Math.random() * 0.4, 0.3, "+0.02"); // vary the sweep rate
  }

  dispose() {
    for (const n of [this.input, this.autopan, this.revSend, ...this.catFx]) {
      try {
        n.dispose();
      } catch {
        /* noop */
      }
    }
  }
}
