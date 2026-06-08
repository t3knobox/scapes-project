/**
 * Prompt-painted background — two tiers, so it ALWAYS delivers a world:
 *
 *  1. proceduralBackground(prompt) — instant gradient mesh seeded by the prompt text.
 *     Zero network, never fails, paints the moment you generate.
 *  2. fetchBackground(prompt) — the real AI depiction via our backend /background route
 *     (RunPod Z-Image-Turbo). Fades in OVER the mesh when ready; on failure the mesh stays.
 *
 * The RunPod key lives server-side — the browser only ever talks to our backend.
 */
const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function fetchBackground(prompt: string): Promise<string | null> {
  try {
    const r = await fetch(`${API}/background`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!r.ok) return null;
    const { url } = await r.json();
    return url ?? null;
  } catch {
    return null; // backend down / network → keep the mesh
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic aurora gradient mesh seeded by the prompt. Returns a CSS `background`
 *  value (layer over backgroundColor: #070710). */
export function proceduralBackground(prompt: string): string {
  const h = hash(prompt || "scape");
  const base = h % 360;
  const hues = [base, (base + 45) % 360, (base + 190) % 360, (base + 300) % 360];
  const pts = [
    [22, 28],
    [78, 24],
    [34, 76],
    [82, 78],
  ];
  return hues
    .map((hue, i) => {
      const [x, y] = pts[i];
      return `radial-gradient(45% 45% at ${x}% ${y}%, hsla(${hue}, 62%, 52%, 0.55), transparent 70%)`;
    })
    .join(", ");
}
