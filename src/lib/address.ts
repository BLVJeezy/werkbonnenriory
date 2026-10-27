export type AddressParts = {
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

export type SiteAddressParts = {
  use_site_address?: boolean;
  site_street?: string | null;
  site_house_number?: string | null;
  site_postal_code?: string | null;
  site_city?: string | null;
};

export function formatSiteAddress(a: SiteAddressParts): string | null {
  return formatAddress({ street: a.site_street, house_number: a.site_house_number, postal_code: a.site_postal_code, city: a.site_city });
}

export function destinationAddress(a: AddressParts & SiteAddressParts & { address?: string | null }): string | null {
  return a.use_site_address ? formatSiteAddress(a) : a.address || formatAddress(a);
}

/** "Kerkstraat 12, 9000 Gent" — empty parts are skipped; null when nothing is filled in. */
export function formatAddress(a: AddressParts): string | null {
  const line1 = [a.street, a.house_number].filter((x) => x && x.trim()).join(" ").trim();
  const line2 = [a.postal_code, a.city].filter((x) => x && x.trim()).join(" ").trim();
  const out = [line1, line2].filter(Boolean).join(", ");
  return out || null;
}
