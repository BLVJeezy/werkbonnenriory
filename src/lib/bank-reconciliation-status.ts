export function isInvoiceReconciled(invoice: { paid_amount?: number; bank_ref?: string | null; bank_reconciled?: boolean }, total: number, linked: boolean) {
  const bankReference = !!invoice.bank_ref && !invoice.bank_ref.startsWith('werkbonnen:');
  const absTotal = Math.abs(total);
  return absTotal > 0 && Number(invoice.paid_amount ?? 0) >= absTotal - 0.005 && (linked || !!invoice.bank_reconciled || bankReference);
}