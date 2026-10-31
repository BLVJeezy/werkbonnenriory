/** Verkoopfacturen uit de Werkbonnen-app: pure omzetting naar Finance-documenten. */
import { r2 } from "@/lib/finance";

/** Vanaf deze datum komen verkoopfacturen uit Werkbonnen; ervoor blijft Simpla de bron.
 *  Simpla's laatste verkoop was nummer 20260813 op 2026-10-23; Werkbonnen gaat verder op 20260814. */
export const WERKBONNEN_START = "2026-10-24";

export type WbInvoice = {
  id: string;
  number: string | null;
  kind?: string | null;
  credit_for?: string | null;
  issue_date: string;
  status?: string | null;
  customer_name?: string | null;
  customer?: { name?: string | null } | null;
  net: number;
  vat: number;
  vat_rate?: number | null;
  lines?: unknown;
};

export type WbDoc = {
  ref: string;
  nummer: string | null;
  datum: string;
  klant: string | null;
  credit: boolean;
  lijnen: { ex: number; vat: number; omschrijving: string }[];
};

export function isCredit(i: WbInvoice): boolean {
  const k = (i.kind ?? "").toLowerCase();
  return k.includes("credit") || !!i.credit_for || Number(i.net) < 0;
}

/** Zet een Werkbonnen-factuur om; null = niet importeren (concept, te oud of leeg). */
export function toDoc(i: WbInvoice, start = WERKBONNEN_START): WbDoc | null {
  if (!i?.id || !i.issue_date) return null;
  const datum = i.issue_date.slice(0, 10);
  if (datum < start) return null;
  const st = (i.status ?? "").toLowerCase();
  if (st === "draft" || st === "concept") return null;
  const ex = r2(Math.abs(Number(i.net) || 0));
  const vat = r2(Math.abs(Number(i.vat) || 0));
  if (!ex && !vat) return null;
  const credit = isCredit(i);
  return {
    ref: `wb-${i.id}`,
    nummer: i.number ?? null,
    datum,
    klant: (i.customer_name ?? i.customer?.name ?? null)?.trim() || null,
    credit,
    lijnen: [{ ex, vat, omschrijving: credit ? "Creditnota" : "Verkoop" }],
  };
}

/** Sleutel om dezelfde factuur van een andere bron (Simpla) te herkennen. */
export function dubbelSleutel(nummer: string | null, credit: boolean): string | null {
  const n = (nummer ?? "").replace(/\s/g, "").toUpperCase();
  return n ? `${credit ? "cn" : "f"}:${n}` : null;
}
