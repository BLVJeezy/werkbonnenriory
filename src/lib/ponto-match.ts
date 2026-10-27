export type PontoTransaction = {
  amount: number;
  remittanceInformation: string | null;
  executionDate: string | null;
  counterpartName: string | null;
};

export type OpenInvoice = {
  id: string;
  number: string;
  total: number;
  paidAmount: number;
};

/** Digits only, so "20260817", "+++202/6081/70000+++" and "Factuur 2026-0817" all compare equal. */
const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Pure: matches an incoming bank transaction to an open invoice.
 * Both the amount (to the cent) and the invoice number in the remittance must match.
 */
export function matchInvoice(tx: PontoTransaction, open: OpenInvoice[]): OpenInvoice | null {
  if (tx.amount <= 0) return null;
  const ref = digits(tx.remittanceInformation ?? "");
  if (!ref) return null;
  for (const inv of open) {
    const due = Math.round((inv.total - inv.paidAmount) * 100) / 100;
    if (due <= 0) continue;
    if (Math.abs(tx.amount - due) > 0.005) continue;
    const num = digits(inv.number);
    if (num && ref.includes(num)) return inv;
  }
  return null;
}
