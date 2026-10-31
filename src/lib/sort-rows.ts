export type SortDir = "asc" | "desc";
export type SortValue = string | number | null | undefined;

/** Sorteert rijen op een waarde; lege waarden altijd onderaan, tekst op Vlaamse volgorde met cijfers natuurlijk. */
export function sortRows<T>(rows: T[], get: (row: T) => SortValue, dir: SortDir): T[] {
  const f = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    const ex = x === null || x === undefined || x === "", ey = y === null || y === undefined || y === "";
    if (ex || ey) return ex === ey ? 0 : ex ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * f;
    return String(x).localeCompare(String(y), "nl-BE", { numeric: true, sensitivity: "base" }) * f;
  });
}
