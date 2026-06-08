import * as Tone from "tone";

/**
 * Master audio bus + transport. Tone nodes are created lazily in build() (never at
 * import) so this module is safe to load; start() must run inside a user gesture to
 * satisfy the browser autoplay policy.
 */
class AudioEngine {
  master!: Tone.Channel;
  private reverb!: Tone.Reverb;
  private limiter!: Tone.Limiter;
  private meter?: Tone.Meter; // post-limiter tap for audio-reactive visuals
  private built = false;
  private started = false;
  bpm = 72;

  build() {
    if (this.built) return;
    this.master = new Tone.Channel({ volume: -6 });
    this.reverb = new Tone.Reverb({ decay: 6, wet: 0.22 }); // shared space for all voices
    this.limiter = new Tone.Limiter(-1); // catch the sum of many voices
    this.master.chain(this.reverb, this.limiter, Tone.getDestination());
    this.meter = new Tone.Meter({ smoothing: 0.85, normalRange: true });
    this.limiter.connect(this.meter); // dead-end fan-out tap (reads, doesn't pass on)
    this.built = true;
  }

  /** Normalized 0..1 output level for audio-reactive visuals (0 before audio flows). */
  getLevel(): number {
    if (!this.meter) return 0;
    const v = this.meter.getValue();
    return typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0;
  }

  /** Must be called from a click/keydown. Idempotent. */
  async start(bpm = 72) {
    this.build();
    if (this.started) return;
    await Tone.start();
    await this.reverb.ready; // impulse response ready before audio flows
    this.bpm = bpm;
    Tone.getTransport().bpm.value = bpm;
    Tone.getTransport().start();
    this.started = true;
  }

  get isStarted() {
    return this.started;
  }
}

export const engine = new AudioEngine();
