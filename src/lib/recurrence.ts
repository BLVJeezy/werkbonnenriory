export type RepeatUnit = "week" | "maand" | "jaar";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Volgende datum na `date` (YYYY-MM-DD), elke `every` weken/maanden/jaren. Maandeinde wordt afgekapt (31 jan + 1 maand = 28/29 feb). */
export function addInterval(date: string, every: number, unit: RepeatUnit): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (unit === "week") return isoDate(new Date(Date.UTC(y, m - 1, d + 7 * every)));
  const months = unit === "maand" ? every : every * 12;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))));
}

/** Alle data vanaf `next` t.e.m. `until` (en niet na `end`), plus de eerstvolgende datum daarna. */
export function occurrencesUntil(next: string, every: number, unit: RepeatUnit, until: string, end?: string | null) {
  const dates: string[] = [];
  let cur = next;
  while (cur <= until && (!end || cur <= end) && dates.length < 500) {
    dates.push(cur);
    cur = addInterval(cur, every, unit);
  }
  return { dates, next: cur };
}

export const REPEAT_PRESETS: { label: string; every: number; unit: RepeatUnit }[] = [
  { label: "Wekelijks", every: 1, unit: "week" },
  { label: "Om de 2 weken", every: 2, unit: "week" },
  { label: "Om de 6 weken", every: 6, unit: "week" },
  { label: "Maandelijks", every: 1, unit: "maand" },
  { label: "Per kwartaal", every: 3, unit: "maand" },
  { label: "Halfjaarlijks", every: 6, unit: "maand" },
  { label: "Jaarlijks", every: 1, unit: "jaar" },
  { label: "Om de 2 jaar", every: 2, unit: "jaar" },
];

export function repeatLabel(every: number, unit: RepeatUnit) {
  const p = REPEAT_PRESETS.find((x) => x.every === every && x.unit === unit);
  if (p) return p.label;
  const names = { week: ["week", "weken"], maand: ["maand", "maanden"], jaar: ["jaar", "jaar"] }[unit];
  return `Om de ${every} ${every === 1 ? names[0] : names[1]}`;
}
