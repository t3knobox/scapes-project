// QWERTY top row → pad index. Up to 10 pads; we have ≤8 non-ambience voices.
export const KEY_ROW = "qwertyuiop".split("");

export function keyToIndex(key: string): number | null {
  const i = KEY_ROW.indexOf(key.toLowerCase());
  return i >= 0 ? i : null;
}
