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

/** Zelfde sleutel als de database: naam + postcode, hoofdletterongevoelig. */
export const customerKey = (c: { name: string; postal_code?: string | null }) =>
  `${c.name.trim().toLowerCase()}|${(c.postal_code ?? "").trim().toLowerCase()}`;
