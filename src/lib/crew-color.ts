import type { CSSProperties } from "react";

/** Readable text colour (near-black or white) for a #rrggbb background. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#111111";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111111" : "#ffffff";
}

/** Inline style that colours a whole task in its crew's colour (user-chosen value, so not a theme token). */
export function crewStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return { backgroundColor: color, color: textOn(color), borderColor: color };
}
