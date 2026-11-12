/** Removing a payment never reopens a completed work order or clears its signature. */
export function removePaymentPatch() {
  return { paid_method: null, paid_amount: null, paid_at: null };
}
/** Invoice paid amount after a work-order payment is removed: only that payment comes off, never below zero. */
export function invoicePaidAfterRemoval(invoicePaid: number, workOrderPaid: number) {
  return Math.max(0, Math.round((Number(invoicePaid || 0) - Number(workOrderPaid || 0)) * 100) / 100);
}
