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
        const pool = this.voices.filter(
          (v) => v.state === "idle" && v.clip.category !== "ambience",
        );
        const v = pool[Math.floor(Math.random() * pool.length)];
        if (v) this.triggerVoice(v);
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
