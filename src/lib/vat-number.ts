export function customerVatNumber(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** Dutch address detection: NL postcodes are 4 digits + 2 letters; Belgian ones are 4 digits only. */
export function isDutchPostalCode(postalCode: string | null | undefined): boolean {
  return /^\d{4}\s?[A-Za-z]{2}$/.test((postalCode ?? "").trim());
}

/** User-defined automatic rate criteria; this is not an external VAT validity check. */
export function vatRateForCustomer(value: string | null | undefined, currentRate: number, housing?: {
  customerType: "private" | "business" | "unknown";
  olderThanTenYears: boolean | null;
}, address?: {
  postalCode?: string | null | undefined;
}): number {
  const vat = customerVatNumber(value);
  // Belgisch en Nederlands bedrijf: 0% met verlegging van heffing.
  if (/^BE/i.test(vat ?? "")) return 0;
  if (/^NL/i.test(vat ?? "")) return 0;
  // Nederlandse particulier (Nederlands postcodeformaat, geen btw-nummer): altijd 21%.
  if (isDutchPostalCode(address?.postalCode)) return 21;
  if (housing?.customerType === "private" && housing.olderThanTenYears === true) return 6;
  return currentRate;
}
