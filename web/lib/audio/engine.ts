import * as Tone from "tone";

/**
 * Master audio bus + transport. Tone nodes are created lazily in build() (never at
 * import) so this module is safe to load; start() must run inside a user gesture to
 * satisfy the browser autoplay policy.
 */
class AudioEngine {
  master!: Tone.Channel;
  spaceReverb!: Tone.Reverb; // per-voice reverb SEND bus (each voice sets its own send amount)
  private reverb!: Tone.Reverb;
  private limiter!: Tone.Limiter;
  private meter?: Tone.Meter; // post-limiter tap for audio-reactive visuals
  private reverbLFO?: Tone.LFO; // slowly breathes the reverb wet so the space feels alive
  private built = false;
  private started = false;
  bpm = 72;

  build() {
    if (this.built) return;
    // "playback" = a larger audio buffer + 0.5s scheduling lookahead, so brief CPU/GPU
    // rendering spikes (scroll, tab refocus, GC) can't cause dropouts. Ambient timing is
    // loose, so the extra latency is unnoticeable. Must be set before any nodes are created.
    Tone.setContext(new Tone.Context({ latencyHint: "playback", lookAhead: 0.5 }));
    this.master = new Tone.Channel({ volume: 0 }); // controlled by the volume slider
    this.reverb = new Tone.Reverb({ decay: 4, wet: 0.22 }); // shared space; shorter tail = lighter convolution
    this.limiter = new Tone.Limiter(-1); // catch the sum of many voices
    this.master.chain(this.reverb, this.limiter, Tone.getDestination());
    // Breathe the reverb wet (one cheap LFO) so the whole space slowly swells + contracts.
    this.reverbLFO = new Tone.LFO({ frequency: 0.04, min: 0.18, max: 0.36 }).start();
    this.reverbLFO.connect(this.reverb.wet);
    // Per-voice reverb SEND bus: a bigger space each voice dials into by its own amount.
    this.spaceReverb = new Tone.Reverb({ decay: 9, wet: 1 });
    this.spaceReverb.connect(this.master);
    this.meter = new Tone.Meter({ smoothing: 0.85, normalRange: true });
    this.limiter.connect(this.meter); // dead-end fan-out tap (reads, doesn't pass on)
    this.built = true;
  }

  /** Master volume from a 0..1 slider (≈ -60dB silent → +6dB loud). */
  setMasterVolume(v: number) {
    if (!this.master) return;
    this.master.volume.value = v <= 0.001 ? -60 : Tone.gainToDb(v) + 6;
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
    // iOS Safari unlock: must happen synchronously inside the user gesture, BEFORE any
    // await yields the microtask and burns the gesture token. We do two things:
    //  1) Kick ctx.resume() (fire-and-forget) so the underlying AudioContext starts running.
    //  2) Play a 1-sample silent buffer — the legacy iOS unlock trick that flips stubborn
    //     Safari versions out of the muted-output state even after resume() resolves.
    const rawCtx = Tone.getContext().rawContext as AudioContext;
    if (rawCtx.state !== "running") void rawCtx.resume();
    try {
      const buf = rawCtx.createBuffer(1, 1, 22050);
      const src = rawCtx.createBufferSource();
      src.buffer = buf;
      src.connect(rawCtx.destination);
      src.start(0);
    } catch {
      /* unlock is best-effort; never block startup if the buffer trick fails */
    }
    await Tone.start(); // resumes the playback-latency context configured in build()
    await this.reverb.ready; // impulse response ready before audio flows
    this.bpm = bpm;
    Tone.getTransport().bpm.value = bpm;
    Tone.getTransport().start();
    this.started = true;
    // Mobile-debug breadcrumb: if audio is silent on a phone, this tells us whether
    // the underlying context actually reached "running" inside the tap gesture.
    console.log(`[engine] started, ctx.state=${rawCtx.state}`);
  }

  /** AudioContext state for diagnostics ("suspended" | "running" | "closed" | "unbuilt"). */
  getContextState(): string {
    if (!this.built) return "unbuilt";
    try {
      return (Tone.getContext().rawContext as AudioContext).state;
    } catch {
      return "unknown";
    }
  }

  get isStarted() {
    return this.started;
  }
}

export const engine = new AudioEngine();
