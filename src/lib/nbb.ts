// Pure verwerking van jaarrekeningen uit de NBB Balanscentrale (CSV met MAR-rubriekcodes). Getest in nbb.test.ts.

export type CompetitorMetrics = {
  fiscal_year: number;
  revenue: number | null;
  gross_margin: number | null;
  profit: number | null;
  equity: number | null;
  employees: number | null;
};

/** Leest het NBB-CSV ("code","waarde") en haalt de kerncijfers eruit. Ontbrekende rubrieken blijven null. */
export function parseNbbCsv(text: string): CompetitorMetrics & { reference: string | null; name: string | null } {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^"([^"]*)","([^"]*)"/.exec(line.trim());
    if (m?.[1] !== undefined && m[2] !== undefined) map.set(m[1], m[2]);
  }
  const num = (...codes: string[]) => {
    for (const c of codes) {
      const v = map.get(c);
      if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
  };
  const end = map.get("Accounting period end date") ?? "";
  return {
    fiscal_year: Number(end.slice(0, 4)) || 0,
    revenue: num("70"),
    gross_margin: num("9900"),
    profit: num("9904"),
    equity: num("10/15"),
    employees: num("9087", "1003"),
    reference: map.get("Reference number") ?? null,
    name: map.get("Entity name") ?? null,
  };
}

/** Ondernemingsnummer naar 10 cijfers (BE0123.456.789 → 0123456789). Ongeldig → null. */
export function normalizeEnterpriseNumber(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  const n = d.length === 9 ? "0" + d : d;
  return /^[01]\d{9}$/.test(n) ? n : null;
}

/** Per boekjaar de recentste neerlegging (correcties winnen van oorspronkelijke). */
export function pickLatestPerYear<T extends { periodEndDateYear: number; depositDate: string }>(deps: T[]): T[] {
  const best = new Map<number, T>();
  for (const d of deps) {
    const cur = best.get(d.periodEndDateYear);
    if (!cur || d.depositDate > cur.depositDate) best.set(d.periodEndDateYear, d);
  }
  return [...best.values()].sort((a, b) => b.periodEndDateYear - a.periodEndDateYear);
}
