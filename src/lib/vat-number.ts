export function customerVatNumber(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** Dutch address detection: NL postcodes are 4 digits + 2 letters; Belgian ones are 4 digits only. */
export function isDutchPostalCode(postalCode: string | null | undefined): boolean {
  return /^\d{4}\s?[A-Za-z]{2}$/.test((postalCode ?? "").trim());
}

/** Herkenning van vrij beroep: de mail zelf bevat letterlijk "vrij beroep". */
export function mentionsVrijBeroep(text: string | null | undefined): boolean {
  return /vrij[\s-]+beroep/i.test(text ?? "");
}

/** User-defined automatic rate criteria; this is not an external VAT validity check. */
export function vatRateForCustomer(value: string | null | undefined, currentRate: number, housing?: {
  customerType: "private" | "business" | "unknown";
  olderThanTenYears: boolean | null;
}, context?: {
  postalCode?: string | null | undefined;
  vrijBeroep?: boolean;
  /** Het bij de klant bewaarde btw-tarief (bv. 6% voor een particuliere woning ouder dan 10 jaar). */
  defaultRate?: number | string | null | undefined;
}): number {
  const vat = customerVatNumber(value);
  // Vrij beroep: altijd 21%, ook met een Belgisch of Nederlands btw-nummer (dan geen verlegging).
  if (context?.vrijBeroep) return 21;
  // Belgisch en Nederlands bedrijf: 0% met verlegging van heffing.
  if (/^BE/i.test(vat ?? "")) return 0;
  if (/^NL/i.test(vat ?? "")) return 0;
  // Nederlandse particulier (Nederlands postcodeformaat, geen btw-nummer): altijd 21%.
  if (isDutchPostalCode(context?.postalCode)) return 21;
  // Belgische particulier, woning ouder dan 10 jaar: 6%.
  if (housing?.customerType === "private" && housing.olderThanTenYears === true) return 6;
  // Anders het tarief dat bij de klant bewaard is.
  const saved = context?.defaultRate == null || context.defaultRate === "" ? NaN : Number(context.defaultRate);
  if ([0, 6, 12, 21].includes(saved)) return saved;
  return currentRate;
}
