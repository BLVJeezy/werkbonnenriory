export type DupRow = { id: string; supplier_id?: string | null; supplier_name: string; supplier_vat?: string | null; invoice_number: string | null; invoice_date: string | null; total: number | string; created_at: string };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const supplierKey = (r: DupRow) => r.supplier_id || norm(r.supplier_vat) || norm(r.supplier_name);

/**
 * Pure: marks later copies as duplicates of the oldest one.
 * Same supplier + same invoice number, or (no number) same supplier + date + total.
 */
export function findPurchaseDuplicates(rows: DupRow[]): Map<string, string> {
  const out = new Map<string, string>();
  const first = new Map<string, string>();
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const sup = supplierKey(r);
    const num = norm(r.invoice_number);
    const key = num ? `${sup}|n|${num}` : r.invoice_date ? `${sup}|d|${r.invoice_date}|${Number(r.total).toFixed(2)}` : null;
    if (!sup || !key) continue;
    const orig = first.get(key);
    if (orig) out.set(r.id, orig); else first.set(key, r.id);
  }
  return out;
}
