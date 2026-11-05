export function isInvoiceReconciled(invoice: { paid_amount?: number; bank_ref?: string | null; bank_reconciled?: boolean }, total: number, linked: boolean) {
  const bankReference = !!invoice.bank_ref && !invoice.bank_ref.startsWith('werkbonnen:');
  return total > 0 && Number(invoice.paid_amount ?? 0) >= total - 0.005 && (linked || !!invoice.bank_reconciled || bankReference);
}