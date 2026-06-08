import { create } from "zustand";
import type { Clip, PadState } from "@/lib/audio/types";

/**
 * UI-facing state only. The live Tone.js objects (players, FX, scheduler) live in
 * lib/audio/session.ts — they aren't serializable and don't belong in the store.
 */
type Store = {
  clips: Clip[];
  padState: Record<string, PadState>;
  loading: boolean;
  isPlaying: boolean;
  autoMode: boolean;
  bpm: number;
  keyName: string;
  prompt: string;
  bgUrl: string | null;

  setClips: (clips: Clip[], keyName: string, bpm: number) => void;
  setPadState: (id: string, s: PadState) => void;
  setLoading: (b: boolean) => void;
  setPlaying: (b: boolean) => void;
  setAuto: (b: boolean) => void;
  setPrompt: (p: string) => void;
  setBg: (url: string | null) => void;
};

export const useStore = create<Store>((set) => ({
  clips: [],
  padState: {},
  loading: false,
  isPlaying: false,
  autoMode: false,
  bpm: 72,
  keyName: "D major",
  prompt: "",
  bgUrl: null,

  setClips: (clips, keyName, bpm) => set({ clips, keyName, bpm }),
  setPadState: (id, s) =>
    set((st) => ({ padState: { ...st.padState, [id]: s } })),
  setLoading: (loading) => set({ loading }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setAuto: (autoMode) => set({ autoMode }),
  setPrompt: (prompt) => set({ prompt }),
  setBg: (bgUrl) => set({ bgUrl }),
}));
