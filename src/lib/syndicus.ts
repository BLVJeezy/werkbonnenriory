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
