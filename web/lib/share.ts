import type { Clip } from "./audio/types";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type ScapeClip = {
  category: string;
  url: string;
  durationSec: number;
  quantize: "soft" | "free";
  loop: boolean;
  key: string;
  bpm: number;
};

export type SavedScape = {
  prompt: string;
  key: string;
  bpm: number;
  bgUrl?: string | null;
  clips: ScapeClip[];
  slug?: string;
  id?: string;
};

/** Build a save payload from the current pack. Returns null if clips aren't serializable
 *  (the mock pack uses in-memory AudioBuffers — only real generated data-URI clips can be saved). */
export function packToSave(
  prompt: string,
  key: string,
  bpm: number,
  bgUrl: string | null,
  clips: Clip[],
): SavedScape | null {
  const out: ScapeClip[] = [];
  for (const c of clips) {
    if (typeof c.src !== "string") return null;
    out.push({
      category: c.category,
      url: c.src,
      durationSec: c.durationSec,
      quantize: c.quantize,
      loop: c.loop,
      key: c.key,
      bpm: c.bpm,
    });
  }
  return { prompt, key, bpm, bgUrl, clips: out };
}

export async function saveScape(pack: SavedScape): Promise<{ id: string; slug: string }> {
  const res = await fetch(`${API}/soundscapes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pack),
  });
  if (!res.ok) throw new Error("SAVE_FAILED");
  return res.json();
}

export async function fetchScape(slug: string): Promise<SavedScape> {
  const res = await fetch(`${API}/s/${slug}`);
  if (!res.ok) throw new Error("NOT_FOUND");
  return res.json();
}

/** Map a fetched scape's clips back to the engine Clip shape (src = url). */
export function scapeToClips(s: SavedScape): Clip[] {
  return s.clips.map((c, i) => ({
    id: `${c.category}_${i}`,
    category: c.category as Clip["category"],
    src: c.url,
    durationSec: c.durationSec,
    quantize: c.quantize,
    loop: c.loop,
    key: c.key,
    bpm: c.bpm,
  }));
}
