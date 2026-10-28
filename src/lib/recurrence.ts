export type RepeatUnit = "week" | "maand" | "jaar";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Weekdagen: 0=maandag t.e.m. 6=zondag (Belgische week). */
export const WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const;
export const ORDINALS = ["eerste", "tweede", "derde", "vierde", "laatste"] as const;

/** N-de weekdag van een maand. ordinal 1-4 = eerste t.e.m. vierde, 5 = laatste. weekday 0=ma..6=zo. */
export function nthWeekdayOfMonth(year: number, month1: number, ordinal: number, weekday: number): string {
  const toMon0 = (jsDay: number) => (jsDay + 6) % 7;
  if (ordinal >= 5) {
    const lastDay = new Date(Date.UTC(year, month1, 0));
    const diff = (toMon0(lastDay.getUTCDay()) - weekday + 7) % 7;
    return isoDate(new Date(Date.UTC(year, month1 - 1, lastDay.getUTCDate() - diff)));
  }
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const diff = (weekday - toMon0(first.getUTCDay()) + 7) % 7;
  return isoDate(new Date(Date.UTC(year, month1 - 1, 1 + diff + 7 * (ordinal - 1))));
}

/** Volgende datum na `date` (YYYY-MM-DD), elke `every` weken/maanden/jaren. Maandeinde wordt afgekapt (31 jan + 1 maand = 28/29 feb). Met ordinal+weekday: de n-de weekdag van elke `every` maanden (of jaren). */
export function addInterval(date: string, every: number, unit: RepeatUnit, ordinal?: number | null, weekday?: number | null): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (unit === "week") return isoDate(new Date(Date.UTC(y, m - 1, d + 7 * every)));
  const months = unit === "maand" ? every : every * 12;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  if (ordinal && weekday != null) return nthWeekdayOfMonth(target.getUTCFullYear(), target.getUTCMonth() + 1, ordinal, weekday);
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))));
}

/** Alle data vanaf `next` t.e.m. `until` (en niet na `end`), plus de eerstvolgende datum daarna. */
export function occurrencesUntil(next: string, every: number, unit: RepeatUnit, until: string, end?: string | null, ordinal?: number | null, weekday?: number | null) {
  const dates: string[] = [];
  let cur = next;
  while (cur <= until && (!end || cur <= end) && dates.length < 500) {
    dates.push(cur);
    cur = addInterval(cur, every, unit, ordinal, weekday);
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

export function repeatLabel(every: number, unit: RepeatUnit, ordinal?: number | null, weekday?: number | null) {
  if (ordinal && weekday != null && unit !== "week") {
    const o = ORDINALS[Math.min(ordinal, 5) - 1] ?? `${ordinal}e`;
    const w = WEEKDAYS[weekday] ?? "";
    if (unit === "maand" && every === 1) return `Elke ${o} ${w} van de maand`;
    if (unit === "jaar" && every === 1) return `Jaarlijks op de ${o} ${w}`;
    return `Om de ${every} ${unit === "maand" ? "maanden" : "jaar"} op de ${o} ${w}`;
  }
  const p = REPEAT_PRESETS.find((x) => x.every === every && x.unit === unit);
  if (p) return p.label;
  const names = { week: ["week", "weken"], maand: ["maand", "maanden"], jaar: ["jaar", "jaar"] }[unit];
  return `Om de ${every} ${every === 1 ? names[0] : names[1]}`;
}
