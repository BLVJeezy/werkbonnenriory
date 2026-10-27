export function customerVatNumber(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** User-defined automatic rate criterion; this is not an external VAT validity check. */
export function vatRateForCustomer(value: string | null | undefined, currentRate: number): number {
  return /^BE/i.test(customerVatNumber(value) ?? "") ? 0 : currentRate;
}