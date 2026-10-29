export type InvoiceOmzetRow = {
  id: string;
  issue_date: string;
  net: number | string;
  vat: number | string;
  total: number | string;
  paid_amount: number | string;
  kind: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Group invoices per day, or per month when the range spans more than 62 days. Credit notes count negative. */
export function groupOmzet(rows: InvoiceOmzetRow[], from: string, to: string) {
  const perMonth = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 62;
  const keyOf = (date: string) => (perMonth ? date.slice(0, 7) : date);
  const map = new Map<string, number>();
  // Pre-fill every bucket in the range so the chart shows quiet days/months too.
  const cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  let guard = 0;
  while (cur <= end && guard++ < 5000) {
    map.set(keyOf(iso(cur)), 0);
    if (perMonth) {
      cur.setMonth(cur.getMonth() + 1, 1);
    } else {
      cur.setDate(cur.getDate() + 1);
    }
  }
  for (const r of rows) {
    const signed = r.kind === "creditnota" ? -1 : 1;
    const k = keyOf(r.issue_date);
    map.set(k, (map.get(k) ?? 0) + signed * Number(r.net));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, omzet]) => ({
      key,
      label: perMonth
        ? new Date(`${key}-02T12:00:00`).toLocaleDateString("nl-BE", { month: "short", year: "numeric" })
        : new Date(`${key}T12:00:00`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" }),
      omzet: Math.round(omzet * 100) / 100,
    }));
}
