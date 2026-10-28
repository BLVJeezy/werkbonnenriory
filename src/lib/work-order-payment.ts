/** Removing a payment never reopens a completed work order or clears its signature. */
export function removePaymentPatch() {
  return { paid_method: null, paid_amount: null, paid_at: null };
}