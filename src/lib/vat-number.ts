export function customerVatNumber(value: string | null | undefined): string | null {
  return value?.trim() || null;
}