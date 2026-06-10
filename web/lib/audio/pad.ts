import * as Tone from "tone";
import { engine } from "./engine";
import { buildAutoFXChain } from "./fx";
import type { Clip, PadState } from "./types";

/**
 * One playable pad voice — the smart, queued, auto-FX trigger.
 *  - "free" clips fade in within ~0.5-1.5s (organic, off-grid).
 *  - "soft" clips snap to the next 2-bar mark so rhythmic elements feel intentional.
 * Loop clips (textures) toggle on/off; one-shots auto-release.
 */
export class PadVoice {
  private player: Tone.Player;
  private fx: Tone.ToneAudioNode[];
  state: PadState = "idle";

  constructor(public clip: Clip) {
    this.player = new Tone.Player({
      url: clip.src,
      loop: clip.loop,
      fadeIn: 0.12,
      fadeOut: 0.35,
    });
    this.fx = buildAutoFXChain(clip.category, clip.id);
    this.player.chain(...this.fx, engine.master);
  }

  async load() {
    await Tone.loaded();
  }

  /** Decoded audio (once loaded) for pitch analysis / sampling. */
  get audioBuffer(): AudioBuffer | undefined {
    return this.player.loaded ? this.player.buffer.get() : undefined;
  }

  private set(s: PadState, cb?: (s: PadState) => void) {
    this.state = s;
    cb?.(s);
  }

  trigger(cb?: (s: PadState) => void) {
    // Loops toggle off; one-shots ignore ANY re-trigger until idle. This prevents calling
    // player.start() on an already-active player — which throws Tone's "start time must be
    // strictly greater than previous start time" and can kill the whole audio graph (silence).
    if (this.state !== "idle") {
      if (this.clip.loop) {
        this.stop();
        cb?.("idle");
      }
      return;
    }

    const T = Tone.getTransport();
    // Fire on click — a tiny lookahead for scheduler safety, no quantize-to-bar wait. Responsive
    // feedback beats grid-lock for a tap-to-play instrument; the harmony bed is the timed backbone.
    const at = "+0.03";

    // Tasteful per-trigger variation (no buffer mutation, so cheap + safe): pull a different
    // slice of sustained textures, and wobble the pitch of non-tonal hits so none are identical.
    const nonTonal = this.clip.category === "perc" || this.clip.category === "earcandy";
    this.player.playbackRate = nonTonal ? 1 + (Math.random() - 0.5) * 0.05 : 1;
    const offset = this.clip.loop ? Math.random() * Math.min(2.5, this.clip.durationSec * 0.4) : 0;

    try {
      this.set("queued", cb);
      this.player.start(at, offset);
      T.scheduleOnce(() => this.set("playing", cb), at);
      if (!this.clip.loop) {
        T.scheduleOnce(() => this.set("idle", cb), `+${this.clip.durationSec + 2}`);
      }
    } catch {
      // Never let a scheduling error propagate and break the audio context.
      this.set("idle", cb);
    }
  }

  stop() {
    try {
      this.player.stop("+0.05");
    } catch {
      /* noop */
    }
    this.state = "idle";
  }

  dispose() {
    try {
      this.player.dispose();
      this.fx.forEach((n) => n.dispose());
    } catch {
      /* noop */
    }
  }
}
