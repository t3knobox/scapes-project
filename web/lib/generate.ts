import type { Clip } from "./audio/types";

/**
 * Real audio generation: POST /generate -> poll /jobs -> map clips to the engine's Clip
 * shape. Used when NEXT_PUBLIC_REAL_AUDIO=1 (the RunPod worker is live); otherwise
 * PromptBar falls back to the procedural mock pack.
 */
const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type GenProgress = { status: string; progress: number };

export async function generateSoundscape(
  prompt: string,
  onProgress?: (p: GenProgress) => void,
): Promise<{ clips: Clip[]; key: string; bpm: number }> {
  let res: Response;
  try {
    res = await fetch(`${API}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    throw new Error("NETWORK"); // backend unreachable
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail?.code ?? "GEN_FAILED");
  }
  const { jobId, key, bpm } = await res.json();

  // Poll up to ~15 min (2s interval) to cover RunPod cold start. The backend has its
  // own GEN_TIMEOUT clock (MAX_JOB_SEC) too.
  for (let i = 0; i < 450; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await fetch(`${API}/jobs/${jobId}`).then((r) => r.json());
    onProgress?.({ status: j.status, progress: j.progress ?? 0 });

    if (j.status === "done") {
      const clips: Clip[] = (j.clips ?? []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        category: c.category as Clip["category"],
        src: c.url as string,
        durationSec: c.durationSec as number,
        quantize: c.quantize as Clip["quantize"],
        loop: c.loop as boolean,
        key: c.key as string,
        bpm: c.bpm as number,
      }));
      return { clips, key: j.key ?? key, bpm: j.bpm ?? bpm };
    }
    if (j.status === "error") throw new Error(j.error ?? "GEN_FAILED");
  }
  throw new Error("GEN_TIMEOUT");
}
