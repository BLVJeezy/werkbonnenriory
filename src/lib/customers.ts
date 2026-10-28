export type CustomerRow = {
  name: string;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  billing_email: string | null;
  vat_number: string | null;
  project_name: string | null;
};

const ALIASES: Record<keyof CustomerRow, string[]> = {
  name: ["naam", "klant", "klantnaam", "name", "bedrijf", "firma", "naam klant"],
  street: ["straat", "street", "adres", "address"],
  house_number: ["nr", "nr.", "huisnummer", "nummer", "number", "huisnr"],
  postal_code: ["postcode", "zip", "postal code", "postnummer"],
  city: ["plaats", "gemeente", "stad", "city", "woonplaats"],
  phone: ["telefoon", "tel", "tel.", "gsm", "phone", "telefoonnummer", "mobiel"],
  email: ["e-mail", "email", "mail", "e-mailadres", "emailadres"],
  billing_email: ["facturatie", "e-mail facturatie", "factuur e-mail", "facturatiemail", "billing email", "e-mail factuur"],
  vat_number: ["btw", "btw-nummer", "btw nummer", "btwnummer", "vat", "ondernemingsnummer"],
  project_name: ["project", "projectnaam", "naam project", "site", "bouw"],
};

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/** Zet rijen uit een Excel-blad (kolomkop -> waarde) om naar klanten. */
export function rowsToCustomers(rows: Record<string, unknown>[]): CustomerRow[] {
  const out: CustomerRow[] = [];
  for (const r of rows) {
    const byKey = new Map(Object.entries(r).map(([k, v]) => [norm(k), v == null ? "" : String(v).trim()]));
    const pick = (f: keyof CustomerRow) => {
      for (const a of ALIASES[f]) {
        const v = byKey.get(a);
        if (v) return v;
      }
      return null;
    };
    const c = Object.fromEntries((Object.keys(ALIASES) as (keyof CustomerRow)[]).map((f) => [f, pick(f)])) as CustomerRow;
    if (!c.name) continue;
    out.push(c);
  }
  return out;
}

const identityPart = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
/** Naam en volledig adres; postcode voorkomt verschillen door gemeentefusies. */
export const customerKey = (c: { name: string; street?: string | null; house_number?: string | null; postal_code?: string | null; city?: string | null }) =>
  `${identityPart(c.name)}|${identityPart((c.street ?? '') + (c.house_number ?? ''))}|${identityPart(c.postal_code)}${c.postal_code?.trim() ? '' : `|${identityPart(c.city)}`}`;

export function splitCustomerAddress(value: string) {
  const m = value.trim().match(/^(.*?)\s+(\d+[\s\S]*)$/);
  return { street: m ? (m[1] ?? '').trim().replace(/[,\s]+$/,'') : value.trim(), house_number: m ? (m[2] ?? '').trim() : '' };
}

export async function allCustomers(client: any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const {data,error} = await client.from('customers').select('*').order('name').order('id').range(offset,offset+999);
    if(error) throw new Error(error.message);
    rows.push(...(data ?? [])); if(!data || data.length<1000) break;
  }
  return rows;
}

/** Waarden zoals een bewerkingsformulier ze aanlevert: elk veld mag ontbreken, leeg of null zijn. */
export type CustomerFormValues = { [K in keyof CustomerRow]?: string | null | undefined };

/**
 * Waarden uit een bewerkingsformulier klaarzetten voor de database:
 * spaties weg, lege velden wissen de gegevens, en een lege naam laten we staan
 * (naam mag nooit leeg worden).
 */
export function customerPatch(input: CustomerFormValues): Partial<CustomerRow> {
  const out: Partial<CustomerRow> = {};
  for (const f of Object.keys(ALIASES) as (keyof CustomerRow)[]) {
    const v = input[f];
    if (v === undefined) continue;
    const t = (v ?? "").trim();
    if (f === "name") {
      if (t) out.name = t;
      continue;
    }
    out[f] = t || null;
  }
  return out;
}
