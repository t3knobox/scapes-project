import { engine } from "./engine";
import { HarmonyEngine } from "./harmony";
import { PadVoice } from "./pad";
import { AutoScheduler } from "./autoMode";
import { useStore } from "@/state/store";
import type { Clip, PadState } from "./types";
import { detectPitch, midiToNote } from "./pitch";
import { clearDebug, registerInstrument } from "./debug";

/**
 * Orchestrates the live audio and bridges it to the UI store.
 *  - HarmonyEngine = the synth chord bed (progression + resolution, seamless).
 *  - PadVoices = the MusicGen ear-candy (leads/perc/vocals/textures) on the pads.
 * The generated "ambience" clip is currently unused as a bed (the synth replaces it);
 * it becomes an atmosphere layer once the MusicGen worker lands.
 */
let harmony: HarmonyEngine | null = null;
let voices: PadVoice[] = [];
let auto: AutoScheduler | null = null;

function padCb(v: PadVoice) {
  return (s: PadState) => useStore.getState().setPadState(v.clip.id, s);
}

// EXPERIMENT (?sampler): pick the first clean single-pitch tonal clip (prefer low register, to
// minimise resampling shift) and route the chord bed through a Tone.Sampler of its timbre —
// proving "AI-generated timbre + our guaranteed-in-key notes".
// Prefer a LOW-register clip (bass first) for the chord bed: the chord plays low notes, so a low
// sample resamples with tiny shifts. A high clip forced down to a bass chord warps badly.
const TONAL_PREFERENCE = ["bass", "mid", "voice", "high"];
const CHORD_MIN_CONF = 0.8; // single-note clips score ~0.9+, so require a clean read
function trySampleChordVoice(h: HarmonyEngine, vs: PadVoice[]) {
  const ordered = TONAL_PREFERENCE.flatMap((cat) => vs.filter((v) => v.clip.category === cat));
  let chosen: { ab: AudioBuffer; midi: number; freq: number; conf: number; cat: string } | null = null;
  for (const v of ordered) {
    const ab = v.audioBuffer;
    if (!ab) continue;
    const res = detectPitch(ab.getChannelData(0), ab.sampleRate);
    console.log(
      `[sampler] "${v.clip.category}" -> ${res ? `${midiToNote(res.midi)} conf ${res.confidence.toFixed(2)}` : "no pitch"}`,
    );
    // first confident clip in preference order wins (= lowest register available)
    if (!chosen && res && res.confidence >= CHORD_MIN_CONF) {
      chosen = { ab, midi: res.midi, freq: res.freq, conf: res.confidence, cat: v.clip.category };
    }
  }
  if (chosen) {
    h.useSample(chosen.ab, chosen.midi, chosen.freq);
    registerInstrument({
      label: "chord-bed",
      baseMidi: chosen.midi,
      detectedFreq: chosen.freq,
      conf: chosen.conf,
      buffer: chosen.ab,
      targets: h.chordTargets(),
    });
    console.log(`[sampler] ✓ chord voice = "${chosen.cat}" @ ${midiToNote(chosen.midi)} (conf ${chosen.conf.toFixed(2)})`);
  } else {
    console.log("[sampler] no usable tonal clip → staying on synth");
  }
}

export const session = {
  voices: () => voices,

  async loadPack(clips: Clip[], keyName: string, bpm: number) {
    this.dispose();
    clearDebug(); // fresh pitch-verification entries per pack
    engine.build();
    const store = useStore.getState();
    store.setLoading(true);

    harmony = new HarmonyEngine(keyName);
    voices = clips.map((c) => new PadVoice(c)); // synth is the bed; every clip is a pad
    await Promise.all(voices.map((v) => v.load()));

    // In-key pipeline (DEFAULT): the chord bed + every clean tonal pad become cents-corrected
    // sampled instruments playing in-key notes. Clips that fail the pitch gate stay raw texture.
    trySampleChordVoice(harmony, voices);
    voices.forEach((v) => v.maybeBecomeInstrument(keyName));

    auto = new AutoScheduler(voices, (v) => v.trigger(padCb(v)));
    store.setClips(clips, keyName, bpm);
    voices.forEach((v) => store.setPadState(v.clip.id, "idle"));
    store.setLoading(false);
  },

  /** Press-play: start the context (gesture) and the evolving chord bed. */
  async play() {
    await engine.start(useStore.getState().bpm);
    engine.setMasterVolume(useStore.getState().volume); // apply current slider level
    harmony?.play();
    useStore.getState().setPlaying(true);
  },

  setVolume(v: number) {
    useStore.getState().setVolume(v);
    engine.setMasterVolume(v);
  },

  stop() {
    harmony?.stop();
    voices.forEach((v) => v.stop());
    auto?.stop();
    const s = useStore.getState();
    s.setPlaying(false);
    s.setAuto(false);
    voices.forEach((v) => s.setPadState(v.clip.id, "idle"));
  },

  async triggerByIndex(i: number) {
    const v = voices[i];
    if (!v) return;
    await engine.start(useStore.getState().bpm); // first tap doubles as the unlock gesture
    v.trigger(padCb(v));
  },

  setAuto(on: boolean) {
    if (!auto) return;
    useStore.getState().setAuto(on);
    if (on) auto.start();
    else auto.stop();
  },

  dispose() {
    harmony?.dispose();
    harmony = null;
    voices.forEach((v) => v.dispose());
    voices = [];
    auto?.stop();
    auto = null;
  },
};
