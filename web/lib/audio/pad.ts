import * as Tone from "tone";
import { engine } from "./engine";
import { buildAutoFXChain } from "./fx";
import { detectPitch, midiToNote, PITCH_CONFIDENCE_MIN } from "./pitch";
import { SampledInstrument } from "./sampledInstrument";
import { registerInstrument } from "./debug";
import {
  getScale,
  degreeToMidi,
  nearestOctave,
  CATEGORY_DEGREES,
  TONAL_CATEGORIES,
  ARP_CATEGORIES,
} from "./scale";
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
  private inst?: SampledInstrument; // set if this pad becomes an in-key sampled instrument
  private instNotes: number[] = []; // the in-key notes it plays off the piano roll
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

  /**
   * Turn a clean, single-pitch TONAL clip into an in-key sampled instrument (the off-key fix):
   * detect its pitch and lay it across this category's scale tones. Noisy/chordal or non-tonal
   * clips fail the confidence gate and stay raw texture (no pitch = no clash).
   */
  maybeBecomeInstrument(key: string) {
    if (!TONAL_CATEGORIES.has(this.clip.category)) return;
    const ab = this.audioBuffer;
    if (!ab) return;
    const res = detectPitch(ab.getChannelData(0), ab.sampleRate);
    if (!res || res.confidence < PITCH_CONFIDENCE_MIN) return; // stays raw texture
    const scale = getScale(key);
    const degrees = CATEGORY_DEGREES[this.clip.category] ?? [0];
    // place each scale tone in the octave nearest the sample → tiny shifts → no timbre warp
    this.instNotes = degrees.map((d) => nearestOctave(degreeToMidi(scale, d), res.midi));
    const out = this.fx[0] ?? engine.master;
    this.inst = new SampledInstrument(ab, res.midi, res.freq, out, {
      attack: this.clip.loop ? 1.2 : 0.4,
      release: 1.6,
      volume: -7,
    });
    console.log(
      `[pad] "${this.clip.category}" -> in-key instrument @ ${midiToNote(res.midi)} (conf ${res.confidence.toFixed(2)}) plays [${this.instNotes.map(midiToNote).join(" ")}]`,
    );
    registerInstrument({
      label: `pad:${this.clip.category}`,
      baseMidi: res.midi,
      detectedFreq: res.freq,
      conf: res.confidence,
      buffer: ab,
      targets: this.instNotes,
    });
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
    const at = "+0.03"; // fire on click (tiny scheduler-safety lookahead), no quantize-to-bar wait

    // Tonal pad → play in-key notes off the piano roll instead of the raw, off-key clip.
    if (this.inst) {
      try {
        this.set("queued", cb);
        if (ARP_CATEGORIES.has(this.clip.category)) {
          this.inst.arp(this.instNotes, Tone.now() + 0.03);
          T.scheduleOnce(() => this.set("playing", cb), at);
          T.scheduleOnce(() => this.set("idle", cb), `+${this.instNotes.length * 0.16 + 0.6}`);
        } else {
          this.inst.attack(this.instNotes, at);
          T.scheduleOnce(() => this.set("playing", cb), at);
          if (!this.clip.loop) {
            T.scheduleOnce(() => {
              this.inst?.release(this.instNotes);
              this.set("idle", cb);
            }, `+${this.clip.durationSec + 1}`);
          }
        }
      } catch {
        this.set("idle", cb);
      }
      return;
    }

    // Raw-clip path: tasteful per-trigger variation (no buffer mutation, cheap + safe) — pull a
    // different slice of sustained textures, wobble the pitch of non-tonal hits so none repeat.
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
      if (this.inst) this.inst.releaseAll("+0.05");
      else this.player.stop("+0.05");
    } catch {
      /* noop */
    }
    this.state = "idle";
  }

  dispose() {
    try {
      this.inst?.dispose();
      this.player.dispose();
      this.fx.forEach((n) => n.dispose());
    } catch {
      /* noop */
    }
  }
}
