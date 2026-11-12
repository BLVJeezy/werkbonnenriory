// Pure helpers for loans created from a repayment table (aflossingstabel).
export type LoanRow = { dueDate: string; capital: number; interest: number };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Next free account pair: same suffix for 173xxx (> 1 jaar) and 423xxx (binnen het jaar), steps of 10. */
export function nextLoanAccounts(existing: string[]): { long: string; short: string } {
  let max = 0;
  for (const n of existing) if (/^(173|423)\d{3}$/.test(n)) max = Math.max(max, Number(n.slice(3)));
  const s = String(Math.floor(max / 10) * 10 + 10).padStart(3, "0");
  return { long: `173${s}`, short: `423${s}` };
}

/** Each 31/12 the capital due in the next year moves from long to short term (except the first year: booked short directly). */
export function reclassifications(rows: LoanRow[]): { year: number; amount: number }[] {
  const byYear = new Map<number, number>();
  for (const r of rows) byYear.set(Number(r.dueDate.slice(0, 4)), r2((byYear.get(Number(r.dueDate.slice(0, 4))) ?? 0) + r.capital));
  const years = [...byYear.keys()].sort();
  return years.slice(1).map((y) => ({ year: y - 1, amount: byYear.get(y)! }));
}
