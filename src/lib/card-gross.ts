/**
 * Kaartuitbetalingen (bv. Europabank) storten netto na commissie; de mededeling bevat het bruto bedrag:
 * "BRUTO: 654,76 - COMM 13,10". Geeft het bruto bedrag terug als het klopt met netto + commissie.
 */
export function cardGross(description: string | null | undefined, net: number): number | null {
  const m = String(description ?? "").match(/BRUTO:?\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/i);
  if (!m || !(net > 0)) return null;
  const toNum = (s: string) => Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  const gross = toNum(m[1]);
  if (!Number.isFinite(gross) || gross < net) return null;
  const c = String(description).match(/COMM\.?:?\s*([\d.]+,\d{2}|\d+(?:\.\d{2})?)/i);
  if (c && Math.abs(gross - toNum(c[1]) - net) > 0.015) return null;
  if (gross - net > gross * 0.1) return null;
  return Math.round(gross * 100) / 100;
}
