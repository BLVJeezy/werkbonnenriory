export type AddressParts = {
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

/** "Kerkstraat 12, 9000 Gent" — empty parts are skipped; null when nothing is filled in. */
export function formatAddress(a: AddressParts): string | null {
  const line1 = [a.street, a.house_number].filter((x) => x && x.trim()).join(" ").trim();
  const line2 = [a.postal_code, a.city].filter((x) => x && x.trim()).join(" ").trim();
  const out = [line1, line2].filter(Boolean).join(", ");
  return out || null;
}
