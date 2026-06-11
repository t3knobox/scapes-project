import * as Tone from "tone";
import { engine } from "./engine";
import { midiToNote } from "./pitch";

export type Mode = "ionian" | "aeolian";

// Chords as semitone offsets from the key root. Lush 7th/9th voicings.
const PROGRESSIONS: Record<Mode, number[][]> = {
  // I – vi – IV – V7  (feel-good; V7 → I resolves each cycle)
  ionian: [
    [0, 4, 7, 11, 14], // Imaj9
    [9, 12, 16, 19], // vi7
    [5, 9, 12, 16], // IVmaj7
    [7, 11, 14, 17], // V7
  ],
  // i – VI – III – VII  (ethereal minor; VII → i resolves home)
  aeolian: [
    [0, 3, 7, 10, 14], // i min9
    [8, 12, 15, 19], // VImaj7
    [3, 7, 10, 14], // IIImaj7
    [10, 14, 17, 21], // VII
  ],
};

const V7 = [7, 11, 14, 17]; // dominant — used to strengthen the cadence periodically

const NOTE_TO_SEMI: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};

export function parseKey(key: string): { rootMidi: number; mode: Mode } {
  const m = key.trim().match(/^([A-G]#?)\s*(major|minor|aeolian|ionian|dorian)?/i);
  const letter = (m?.[1] ?? "D").toUpperCase();
  const quality = (m?.[2] ?? "major").toLowerCase();
  const mode: Mode = quality.startsWith("min") || quality === "aeolian" ? "aeolian" : "ionian";
  const rootMidi = 36 + (NOTE_TO_SEMI[letter] ?? 2); // place root ~octave 2 (C2 = 36)
  return { rootMidi, mode };
}

/**
 * The synth-led harmonic bed: a slow chord progression that shifts and resolves, played
 * seamlessly (overlapping attack/release = no gaps). This is the musical backbone the
 * MusicGen textures/leads layer on top of.
 */
export class HarmonyEngine {
  private synth: Tone.PolySynth;
  private sampler?: Tone.Sampler; // optional SAO-timbre chord voice (the ?sampler experiment)
  private active!: Tone.PolySynth | Tone.Sampler; // whichever voice currently plays the chords
  private tuneRatio = 1; // corrects the sample's off-concert pitch onto 12-TET (sampler only)
  private filter = new Tone.Filter(1100, "lowpass");
  private filterLFO = new Tone.LFO({ frequency: 0.03, min: 600, max: 2100 }); // warmer ceiling (less bright)
  private widthLFO = new Tone.LFO({ frequency: 0.02, min: 0.2, max: 0.8 });
  private widener = new Tone.StereoWidener(0.5);
  private chorus = new Tone.Chorus(0.2, 3.5, 0.4);
  private gain = new Tone.Gain(0.85);

  // Subtle in-key "key-jabs" — a glassy bell that sprinkles chord tones over the progression.
  private jab = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 5,
    modulationIndex: 6,
    envelope: { attack: 0.004, decay: 1.4, sustain: 0, release: 1.2 },
    volume: -13,
  });
  private jabDelay = new Tone.PingPongDelay("8n.", 0.28);

  private rootMidi: number;
  private mode: Mode;
  private prog: number[][];
  private idx = 0;
  private cycle = 0;
  private repeatId?: number;
  private current: string[] = [];
  barsPerChord = 2;

  constructor(key: string) {
    const { rootMidi, mode } = parseKey(key);
    this.rootMidi = rootMidi;
    this.mode = mode;
    this.prog = PROGRESSIONS[mode];

    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsine", count: 1, spread: 18 }, // single osc/voice → half the DSP (chorus adds width back)
      envelope: { attack: 2.6, decay: 1.5, sustain: 0.85, release: 4.5 }, // long → seamless overlap
      volume: -4,
    });
    this.chorus.start();
    this.synth.chain(this.chorus, this.filter, this.widener, this.gain, engine.master);
    this.filterLFO.connect(this.filter.frequency);
    this.widthLFO.connect(this.widener.width);

    this.jabDelay.wet.value = 0.25;
    this.jab.chain(this.jabDelay, engine.master);
    this.active = this.synth; // default chord voice; swap to a Sampler via useSample()
  }

  /**
   * EXPERIMENT: render the chord bed through a Tone.Sampler built from one pitch-detected SAO
   * clip — an AI-generated timbre playing our guaranteed-in-key notes. It joins the same chord
   * FX chain; the PolySynth stays wired but is simply never triggered.
   */
  useSample(buffer: AudioBuffer, baseMidi: number, detectedFreq: number) {
    // SAO isn't at concert pitch, so the clip's true pitch ≠ the named note. Scale every note
    // we ask for by this ratio so the resampled bed lands exactly on 12-TET (in tune with the
    // key-jabs and the target scale). Without it, the whole bed is detuned up to ~50 cents.
    const trueBaseFreq = 440 * Math.pow(2, (baseMidi - 69) / 12);
    this.tuneRatio = trueBaseFreq / detectedFreq;
    this.sampler = new Tone.Sampler({
      urls: { [midiToNote(baseMidi)]: buffer },
      attack: 2, // long, pad-like fade so chords overlap seamlessly
      release: 4,
      volume: -6,
    });
    this.sampler.connect(this.chorus); // join chorus → filter → widener → gain → master
    this.active = this.sampler;
  }

  /** Notes the active voice should receive: note names for the synth; tuning-corrected
   *  frequencies for the sampler (so an off-concert sample still hits the exact scale tones). */
  private voiceNotes(notes: string[]): (string | number)[] {
    if (this.active !== this.sampler) return notes;
    return notes.map((n) => Tone.Frequency(n).toFrequency() * this.tuneRatio);
  }

  /** Sprinkle a couple of in-key bell notes (high chord tones) over the current chord. Sparse. */
  private maybeJab(time: number, offsets: number[]) {
    if (Math.random() > 0.6) return; // most chords get none → stays subtle
    const beat = 60 / (Tone.getTransport().bpm.value || 72);
    const count = 1 + Math.floor(Math.random() * 2); // 1–2 notes
    for (let i = 0; i < count; i++) {
      const off = offsets[Math.floor(Math.random() * offsets.length)];
      const note = Tone.Frequency(this.rootMidi + off + 12, "midi").toNote(); // 1 octave up = warm mid, not piercing
      const at = time + beat * Math.floor(Math.random() * this.barsPerChord * 4);
      try {
        this.jab.triggerAttackRelease(note, "8n", at, 0.35 + Math.random() * 0.3);
      } catch {
        /* never let a scheduling collision break the bed */
      }
    }
  }

  private notes(offsets: number[]): string[] {
    const chord = offsets.map((o) => Tone.Frequency(this.rootMidi + o, "midi").toNote());
    const sub = Tone.Frequency(this.rootMidi - 12, "midi").toNote(); // sub-bass root (synth = the bass)
    return [sub, ...chord];
  }

  play() {
    if (this.repeatId !== undefined) return; // guard: never double-schedule the bed
    const T = Tone.getTransport();
    this.filterLFO.start();
    this.widthLFO.start();
    this.idx = 0;
    this.cycle = 0;
    this.current = this.notes(this.prog[0]);
    try {
      this.active.triggerAttack(this.voiceNotes(this.current)); // tonic first — the "home" we resolve to
    } catch {
      /* noop */
    }

    this.repeatId = T.scheduleRepeat((time) => {
      // Wrap the whole chord change: an unhandled Tone scheduling error here would otherwise
      // break the transport and silence everything.
      try {
        this.active.triggerRelease(this.voiceNotes(this.current), time); // release old (long tail)…
        this.idx = (this.idx + 1) % this.prog.length;
        if (this.idx === 0) this.cycle++;

        let offsets = this.prog[this.idx];
        // every 3rd cycle, replace the pre-tonic chord with a V7 for a stronger cadence
        if (this.idx === this.prog.length - 1 && this.cycle % 3 === 2) offsets = V7;

        this.current = this.notes(offsets);
        this.active.triggerAttack(this.voiceNotes(this.current), time + 0.02); // …attack new — overlap → no gap
        this.maybeJab(time, offsets); // sprinkle in-key bell accents
      } catch {
        /* keep the bed alive even if one chord change hiccups */
      }
    }, `${this.barsPerChord}m`);
  }

  stop() {
    const T = Tone.getTransport();
    if (this.repeatId !== undefined) {
      T.clear(this.repeatId);
      this.repeatId = undefined;
    }
    this.active.releaseAll();
    this.jab.releaseAll();
    this.filterLFO.stop();
    this.widthLFO.stop();
  }

  dispose() {
    this.stop();
    this.sampler?.dispose();
    for (const n of [this.synth, this.jab, this.jabDelay, this.filter, this.filterLFO, this.widthLFO, this.widener, this.chorus, this.gain]) {
      try {
        n.dispose();
      } catch {
        /* noop */
      }
    }
  }

  /** Current chord's notes (for future pitch-snapping of leads). */
  currentChord(): string[] {
    return this.current;
  }

  /** Representative tonic-chord MIDI notes (for the pitch-verification debug panel). */
  chordTargets(): number[] {
    return [this.rootMidi - 12, ...this.prog[0].map((o) => this.rootMidi + o)];
  }
}
