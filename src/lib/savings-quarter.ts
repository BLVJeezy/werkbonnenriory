export const SAVINGS_ACCOUNT = "550700";
const KEY = "riory-savings-quarter-done";

/** Last fully finished quarter for a YYYY-MM-DD date, e.g. 2026-11-01 → 2026-Q3 (2026-07-01..2026-09-30). */
export function previousQuarter(today: string): { label: string; start: string; end: string } {
  const y = Number(today.slice(0, 4));
  const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3); // current quarter 0..3
  const py = q === 0 ? y - 1 : y;
  const pq = q === 0 ? 3 : q - 1;
  const sm = pq * 3 + 1;
  const em = sm + 2;
  const last = new Date(Date.UTC(py, em, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { label: `${py}-Q${pq + 1}`, start: `${py}-${pad(sm)}-01`, end: `${py}-${pad(em)}-${pad(last)}` };
}

export function savingsQuarterDone(today: string): boolean {
  try { return localStorage.getItem(KEY) === previousQuarter(today).label; } catch { return false; }
}

export function markSavingsQuarterDone(today = new Date().toISOString().slice(0, 10)) {
  try { localStorage.setItem(KEY, previousQuarter(today).label); } catch { /* storage geblokkeerd */ }
}
