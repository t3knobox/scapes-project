import { engine } from "./engine";
import { HarmonyEngine } from "./harmony";
import { PadVoice } from "./pad";
import { AutoScheduler } from "./autoMode";
import { useStore } from "@/state/store";
import type { Clip, PadState } from "./types";
import { detectPitch, midiToNote } from "./pitch";

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
const TONAL_PREFERENCE = ["bass", "mid", "voice", "high"];
// Experiment bar: real single-note samples score ~0.85+, but today's evolving textures are
// lower — accept the best tonal clip down to this so the concept is at least audible now.
const EXPERIMENT_MIN_CONF = 0.5;
function trySampleChordVoice(h: HarmonyEngine, vs: PadVoice[]) {
  const ordered = TONAL_PREFERENCE.flatMap((cat) => vs.filter((v) => v.clip.category === cat));
  let best: { ab: AudioBuffer; midi: number; freq: number; conf: number; cat: string } | null = null;
  for (const v of ordered) {
    const ab = v.audioBuffer;
    if (!ab) continue;
    const res = detectPitch(ab.getChannelData(0), ab.sampleRate);
    console.log(
      `[sampler] "${v.clip.category}" -> ${res ? `${midiToNote(res.midi)} conf ${res.confidence.toFixed(2)}` : "no pitch"}`,
    );
    if (res && (!best || res.confidence > best.conf))
      best = { ab, midi: res.midi, freq: res.freq, conf: res.confidence, cat: v.clip.category };
  }
  if (best && best.conf >= EXPERIMENT_MIN_CONF) {
    h.useSample(best.ab, best.midi, best.freq);
    console.log(`[sampler] ✓ chord voice = "${best.cat}" @ ${midiToNote(best.midi)} (conf ${best.conf.toFixed(2)})`);
  } else {
    console.log("[sampler] no usable tonal clip → staying on synth");
  }
}

export const session = {
  voices: () => voices,

  async loadPack(clips: Clip[], keyName: string, bpm: number) {
    this.dispose();
    engine.build();
    const store = useStore.getState();
    store.setLoading(true);

    harmony = new HarmonyEngine(keyName);
    voices = clips.map((c) => new PadVoice(c)); // synth is the bed; every clip is a pad
    await Promise.all(voices.map((v) => v.load()));

    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("sampler")) {
      trySampleChordVoice(harmony, voices); // chord bed → sampled in-key
      voices.forEach((v) => v.maybeBecomeInstrument(keyName)); // each tonal pad → in-key instrument
    }

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
