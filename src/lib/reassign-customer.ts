import { formatAddress } from "./address";
import { vatRateForCustomer } from "./vat-number";

type Cust = { id?: string; name: string; street?: string | null; house_number?: string | null; postal_code?: string | null; city?: string | null; phone?: string | null; email?: string | null; billing_email?: string | null; vat_number?: string | null; vrij_beroep?: boolean | null };
type Wo = Omit<Cust, "name"> & { use_site_address: boolean; site_street?: string | null; site_house_number?: string | null; site_postal_code?: string | null; site_city?: string | null; customer_name: string; vat_rate: number };

/** Factuurklant wijzigen: de werkplek blijft het oude adres (als werfadres), afstand/prijzen blijven ongemoeid. */
export function reassignCustomerPatch(wo: Wo, c: Cust) {
  const keepSite = wo.use_site_address
    ? {}
    : { use_site_address: true, site_street: wo.street ?? null, site_house_number: wo.house_number ?? null, site_postal_code: wo.postal_code ?? null, site_city: wo.city ?? null };
  return {
    ...keepSite,
    customer_id: c.id ?? null,
    customer_name: c.name,
    street: c.street ?? null,
    house_number: c.house_number ?? null,
    postal_code: c.postal_code ?? null,
    city: c.city ?? null,
    address: formatAddress({ street: c.street ?? "", house_number: c.house_number ?? "", postal_code: c.postal_code ?? "", city: c.city ?? "" }),
    phone: c.phone ?? null,
    email: c.email ?? null,
    billing_email: c.billing_email ?? null,
    vat_number: c.vat_number ?? null,
    vat_rate: vatRateForCustomer(c.vat_number ?? "", Number(wo.vat_rate), undefined, { postalCode: c.postal_code, vrijBeroep: !!c.vrij_beroep, defaultRate: c.default_vat_rate }),
    project_id: null,
    project_name: null,
  };
}
