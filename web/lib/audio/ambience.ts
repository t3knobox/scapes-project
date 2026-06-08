import * as Tone from "tone";
import { engine } from "./engine";
import type { Clip } from "./types";

/**
 * The always-evolving bed. A looping player whose tone is continuously modulated by
 * slow LFOs (filter sweep + stereo width) so the track never sits still — this is what
 * gives "press play and it breathes" without any user input.
 */
export class AmbienceLoop {
  player: Tone.Player;
  private filter = new Tone.Filter(900, "lowpass");
  private filterLFO = new Tone.LFO({ frequency: 0.03, min: 500, max: 3800 });
  private widthLFO = new Tone.LFO({ frequency: 0.02, min: 0.2, max: 0.85 });
  private widener = new Tone.StereoWidener(0.5);
  private chorus = new Tone.Chorus(0.18, 3.5, 0.4);

  constructor(clip: Clip) {
    this.player = new Tone.Player({ url: clip.src, loop: true, fadeIn: 2, fadeOut: 2 });
    this.chorus.start();
    this.player.chain(this.chorus, this.filter, this.widener, engine.master);
    this.filterLFO.connect(this.filter.frequency);
    this.widthLFO.connect(this.widener.width);
  }

  async load() {
    await Tone.loaded();
  }

  play() {
    this.filterLFO.start();
    this.widthLFO.start();
    this.player.start();
  }

  stop() {
    try {
      this.player.stop();
      this.filterLFO.stop();
      this.widthLFO.stop();
    } catch {
      /* already stopped */
    }
  }

  dispose() {
    for (const n of [this.player, this.filter, this.filterLFO, this.widthLFO, this.widener, this.chorus]) {
      try {
        n.dispose();
      } catch {
        /* noop */
      }
    }
  }
}
