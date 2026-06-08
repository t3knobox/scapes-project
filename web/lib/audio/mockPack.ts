import * as Tone from "tone";
import type { Clip, Category } from "./types";

/**
 * Procedurally renders a full ethereal pack with Tone.Offline — so step-1 dev needs NO
 * binary audio files and NO GPU. Each category is synthesized to a short buffer; the
 * engine plays these exactly as it will play real generated clips (same Tone.Player path).
 * Swap renderMockPack() for a fetch of backend clip URLs to go live.
 */
const KEY = "D major";
const BPM = 72;

function render(dur: number, build: () => void): Promise<Tone.ToneAudioBuffer> {
  return Tone.Offline(() => build(), dur);
}

function texture() {
  return render(6, () => {
    const g = new Tone.Gain(0.32).toDestination();
    const lp = new Tone.Filter(800, "lowpass").connect(g);
    const ns = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 2, decay: 0.2, sustain: 1, release: 2 },
    }).connect(lp);
    ns.triggerAttackRelease(4.5, 0);
  });
}

// Stand-in "ear-candy" sparkle (a glassy FM ping) for the mock pack.
function earcandy(note: string) {
  return render(1.6, () => {
    const g = new Tone.Gain(0.5).toDestination();
    const fm = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 8,
      envelope: { attack: 0.005, decay: 0.7, sustain: 0, release: 0.6 },
    }).connect(g);
    fm.triggerAttackRelease(note, 0.8, 0);
  });
}

function perc(note: string) {
  return render(0.8, () => {
    const s = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.3 },
    }).toDestination();
    s.triggerAttackRelease(note, 0.4, 0, 0.5);
  });
}

export async function renderMockPack(): Promise<{ clips: Clip[]; key: string; bpm: number }> {
  const make = (
    id: string,
    category: Category,
    src: Tone.ToneAudioBuffer,
    durationSec: number,
    quantize: "soft" | "free",
    loop: boolean,
  ): Clip => ({ id, category, src, durationSec, quantize, loop, key: KEY, bpm: BPM });

  const clips: Clip[] = [
    make("texture_0", "texture", await texture(), 6, "free", true),
    make("texture_1", "texture", await texture(), 6, "free", true),
    make("environmental_0", "environmental", await texture(), 6, "free", true),
    make("environmental_1", "environmental", await texture(), 6, "free", true),
    make("earcandy_0", "earcandy", await earcandy("F#5"), 1.6, "soft", false),
    make("earcandy_1", "earcandy", await earcandy("A5"), 1.6, "soft", false),
    make("perc_0", "perc", await perc("A5"), 0.8, "soft", false),
    make("perc_1", "perc", await perc("E5"), 0.8, "soft", false),
  ];
  return { clips, key: KEY, bpm: BPM };
}
