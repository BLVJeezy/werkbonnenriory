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
  site_contact_name?: string | null;
  site_contact_phone?: string | null;
};

export function formatSiteAddress(a: SiteAddressParts): string | null {
  return formatAddress({ street: a.site_street ?? null, house_number: a.site_house_number ?? null, postal_code: a.site_postal_code ?? null, city: a.site_city ?? null });
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

/** Regels zoals op een envelop: "Kerkstraat 12" en "9000 Gent". Lege delen vallen weg. */
export function addressLines(a: AddressParts): string[] {
  const line1 = [a.street, a.house_number].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  const line2 = [a.postal_code, a.city].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean);
}

/**
 * Regels van het adres waar de ploeg naartoe gaat.
 * Zelfde keuze als destinationAddress, zodat de routeknop altijd bij de getoonde regels hoort.
 */
export function destinationLines(a: AddressParts & SiteAddressParts & { address?: string | null }): string[] {
  if (a.use_site_address) {
    return addressLines({
      street: a.site_street ?? null,
      house_number: a.site_house_number ?? null,
      postal_code: a.site_postal_code ?? null,
      city: a.site_city ?? null,
    });
  }
  const legacy = (a.address ?? "").trim();
  return legacy ? [legacy] : addressLines(a);
}

/** Wat voor adres de ploeg te zien krijgt. */
export const destinationLabel = (a: Pick<SiteAddressParts, "use_site_address">) =>
  a.use_site_address ? "Werfadres" : "Adres";
