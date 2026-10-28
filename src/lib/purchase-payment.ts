import type { PontoTransaction } from './ponto-match';

export type PayablePurchase = { id: string; invoice_number: string | null; payment_ref: string | null; total: number; kind: string; status: string };
const canonical = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
export function canExportPurchase(r: { kind: string; status: string; total: number; payment_method?: string }) {
  return r.kind !== 'creditnota' && r.status === 'goedgekeurd' && r.total > 0 && (!r.payment_method || r.payment_method === 'overschrijving');
}
export function matchPurchasePayment(tx: PontoTransaction, rows: PayablePurchase[]) {
  const ref = canonical(tx.remittanceInformation ?? '');
  if (!ref || !Number.isFinite(tx.amount) || tx.amount === 0) return null;
  const matches = rows.filter(r => {
    if (!['goedgekeurd', 'betaling_klaargezet'].includes(r.status)) return false;
    if (r.kind !== 'creditnota' && r.total <= 0) return false;
    if (r.kind === 'creditnota' ? tx.amount <= 0 : tx.amount >= 0) return false;
    if (Math.abs(Math.abs(tx.amount) - Math.abs(r.total)) >= 0.005) return false;
    const paymentRef = canonical(r.payment_ref ?? '');
    if (paymentRef && ref === paymentRef) return true;
    const number = canonical(r.invoice_number ?? '');
    if (!number) return false;
    // Never match a short number as a substring of another invoice number.
    return ref === number || (tx.remittanceInformation ?? '').split(/[\s:;,]+/).some(t => canonical(t) === number);
  });
  return matches.length === 1 ? matches[0] : null;
}