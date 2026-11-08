// Browser-safe regels voor loonvoorschotten (dag van de maand + bedrag).
export type SalaryAdvance = { day: number; amount: number };

/** Leest bv. "10: 500; 20: 500" of "10e 500, 20e 500". */
export function parseSalaryAdvances(raw: string): SalaryAdvance[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  const parts = text.split(/[;\n]|,(?=\s*\d{1,2}\s*(?:e|ste|de)?\s*[:=\s])/i).map((p) => p.trim()).filter(Boolean);
  const out: SalaryAdvance[] = [];
  for (const part of parts) {
    const m = part.match(/^(\d{1,2})\s*(?:e|ste|de)?\s*[:=\s-]\s*(?:€|eur)?\s*([\d.,]+)\s*(?:€|eur)?$/i);
    if (!m || !m[1] || !m[2]) throw new Error(`Voorschot "${part}" niet begrepen. Schrijf bv. 10: 500; 20: 500`);
    const day = Number(m[1]);
    const amount = Number(m[2].replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    if (day < 1 || day > 31) throw new Error("Dag van een voorschot moet tussen 1 en 31 liggen");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error("Ongeldig voorschotbedrag");
    out.push({ day, amount: Math.round(amount * 100) / 100 });
  }
  return out.sort((a, b) => a.day - b.day);
}

export function normalizeAdvances(value: unknown): SalaryAdvance[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is SalaryAdvance => !!v && typeof v === "object" && Number.isFinite((v as any).day) && Number.isFinite((v as any).amount))
    .map((v) => ({ day: v.day, amount: v.amount }));
}

const eur = (n: number) => n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatSalaryAdvances(value: unknown): string {
  return normalizeAdvances(value).map((a) => `${a.day}: ${eur(a.amount).replace(",00", "")}`).join("; ");
}

/** Zin voor het contract, of null als er geen voorschotten zijn. */
export function describeSalaryAdvances(value: unknown, settlementDay = 1): string | null {
  const list = normalizeAdvances(value);
  if (!list.length) return null;
  const items = list.map((a) => `de ${a.day}e van de maand een voorschot van EUR ${eur(a.amount)}`);
  const joined = items.length > 1 ? `${items.slice(0, -1).join(", ")} en ${items[items.length - 1]}` : items[0];
  const total = list.reduce((s, a) => s + a.amount, 0);
  return `Partijen komen overeen dat het loon wordt betaald via voorschotten: ${joined} (samen EUR ${eur(total)} netto). De afrekening van het saldo van het nettoloon gebeurt op de ${settlementDay}e van de volgende maand, na aftrek van de betaalde voorschotten.`;
}
