// Syndicusaanvraag: de VME is de klant, het werfadres is het facturatieadres,
// de syndicus wordt als extra info bewaard; mailadressen van de syndicus blijven.
export type SyndicusFields = {
  customer_name: string;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  site_street: string | null;
  site_house_number: string | null;
  site_postal_code: string | null;
  site_city: string | null;
  syndicus: string | null;
  vme_name: string | null;
};

export function applySyndicus<T extends SyndicusFields>(x: T): T & { use_site_address: boolean } {
  const syndicus = x.syndicus?.trim();
  const vme = x.vme_name?.trim();
  const hasSite = !!(x.site_street || x.site_city);
  if (!syndicus || !vme) return { ...x, use_site_address: hasSite };
  return {
    ...x,
    customer_name: vme,
    street: hasSite ? x.site_street : x.street,
    house_number: hasSite ? x.site_house_number : x.house_number,
    postal_code: hasSite ? x.site_postal_code : x.postal_code,
    city: hasSite ? x.site_city : x.city,
    syndicus,
    use_site_address: false,
  };
}

/** De syndicusgegevens die apart bij een klant bewaard worden. */
export const SYNDICUS_DETAIL_FIELDS = [
  "syndicus_company",
  "syndicus_contact",
  "syndicus_vat_number",
  "syndicus_street",
  "syndicus_house_number",
  "syndicus_postal_code",
  "syndicus_city",
  "syndicus_phone",
  "syndicus_email",
  "syndicus_billing_email",
] as const;

export type SyndicusDetailField = (typeof SYNDICUS_DETAIL_FIELDS)[number];

export type SyndicusDetails = Partial<Record<SyndicusDetailField, string | null | undefined>>;

/**
 * Naam van het syndicuskantoor zoals die boven de gegevens staat:
 * bedrijfsnaam, eventueel gevolgd door de contactpersoon.
 */
export function syndicusLabel(d: { syndicus_company?: string | null; syndicus_contact?: string | null }): string | null {
  const company = d.syndicus_company?.trim();
  const contact = d.syndicus_contact?.trim();
  if (company && contact) return `${company} – ${contact}`;
  return company || contact || null;
}

/**
 * De syndicusgegevens uit een bewerkingsformulier klaarzetten voor de database:
 * spaties weg, lege velden wissen de gegevens, en de weergavenaam volgt uit
 * bedrijfsnaam en contactpersoon.
 */
export function syndicusDetailsPatch(input: SyndicusDetails): Record<SyndicusDetailField, string | null> & { syndicus: string | null } {
  const out = {} as Record<SyndicusDetailField, string | null>;
  for (const f of SYNDICUS_DETAIL_FIELDS) out[f] = input[f]?.trim() || null;
  return { ...out, syndicus: syndicusLabel(out) };
}

/**
 * De syndicusnamen die al bij klanten horen: zonder duplicaten, zonder lege namen,
 * alfabetisch gesorteerd. Gebruikt als suggestielijst in het bewerkingsvak.
 */
export function syndicusSuggestions(rows: { syndicus?: string | null }[]): string[] {
  const names = new Set<string>();
  for (const r of rows) {
    const s = r.syndicus?.trim();
    if (s) names.add(s);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "nl"));
}
