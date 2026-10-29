/** First hour is always charged in full, then per started quarter hour. No time = 0. */
export function billableHours(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds <= 3600) return 1;
  return 1 + Math.ceil((seconds - 3600) / 900) * 0.25;
}

export type Totals = { labour: number; km: number; materials: number; net: number; vat: number; total: number };

export function computeTotals(o: {
  seconds: number;
  hourlyRate: number;
  distanceKm: number | null;
  kmRate: number;
  materials: { quantity: number; unit_price: number }[];
  vatRate: number;
  /** Warranty: first hour and kilometres are not charged. */
  warranty?: boolean;
}): Totals {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const hours = Math.max(0, billableHours(o.seconds) - (o.warranty ? 1 : 0));
  const labour = r2(hours * o.hourlyRate);
  const km = o.warranty ? 0 : r2((o.distanceKm ?? 0) * o.kmRate);
  const materials = r2(o.materials.reduce((s, m) => s + Number(m.quantity) * Number(m.unit_price), 0));
  const net = r2(labour + km + materials);
  const vat = r2((net * o.vatRate) / 100);
  return { labour, km, materials, net, vat, total: r2(net + vat) };
}

export const VAT_RATES = [21, 12, 6, 0] as const;

/** Omzet van een afgewerkte bon: het betaalde bedrag, of het berekende totaal als er nog geen betaling is. */
export function workOrderRevenue(o: {
  paidAmount: number | null;
  seconds: number;
  hourlyRate: number;
  distanceKm: number | null;
  kmRate: number;
  materials: { quantity: number; unit_price: number }[];
  vatRate: number;
  warranty?: boolean;
}): number {
  if (o.paidAmount != null) return Math.round(Number(o.paidAmount) * 100) / 100;
  return computeTotals(o).total;
}

export const euro = (n: number) => n.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
