export const VAT_RATES = [0, 6, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Herkent 0/6/21% uit netto en btw; null = gemengd of fout uitgelezen. */
export function detectVatRate(exVat: number, vat: number): VatRate | null {
  const ex = Math.abs(exVat), v = Math.abs(vat);
  if (!ex) return null;
  if (v <= 0.02) return 0;
  const tol = Math.max(0.05, ex * 0.002);
  for (const r of [6, 21] as const) if (Math.abs(v - ex * r / 100) <= tol) return r;
  return null;
}

export const vatFor = (exVat: number, rate: VatRate) => r2(exVat * rate / 100);

/** Aankoop = terug te vorderen, verkoop = te betalen. */
export const vatSide = (direction: string) => (direction === "verkoop" ? "te betalen" : "terug te vorderen");
