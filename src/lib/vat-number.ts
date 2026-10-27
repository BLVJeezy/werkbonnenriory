export function customerVatNumber(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** User-defined automatic rate criterion; this is not an external VAT validity check. */
export function vatRateForCustomer(value: string | null | undefined, currentRate: number, housing?: {
  customerType: "private" | "business" | "unknown";
  olderThanTenYears: boolean | null;
}): number {
  if (/^BE/i.test(customerVatNumber(value) ?? "")) return 0;
  if (housing?.customerType === "private" && housing.olderThanTenYears === true) return 6;
  return currentRate;
}