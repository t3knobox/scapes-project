import * as Tone from "tone";
import type { PadVoice } from "./pad";

/**
 * AutoMode: every 2 bars, maybe trigger a random idle non-ambience voice. Because the
 * pool is only *idle* voices, the mix is self-limiting (no flooding). Each trigger goes
 * through PadVoice.trigger, so it gets the same auto-FX + quantize as a manual tap.
 */
export class AutoScheduler {
  private id?: number;

  constructor(
    private voices: PadVoice[],
    private triggerVoice: (v: PadVoice) => void,
  ) {}

  start() {
    if (this.id !== undefined) return;
    this.id = Tone.getTransport().scheduleRepeat(() => {
      if (Math.random() < 0.55) {
        const pool = this.voices.filter((v) => v.state === "idle");
        const v = pool[Math.floor(Math.random() * pool.length)];
        if (v) {
          try {
            this.triggerVoice(v);
          } catch {
            /* keep the scheduler alive even if one trigger fails */
          }
        }
      }
    }, "2m");
  }

  stop() {
    if (this.id !== undefined) {
      Tone.getTransport().clear(this.id);
      this.id = undefined;
    }
  }
}
