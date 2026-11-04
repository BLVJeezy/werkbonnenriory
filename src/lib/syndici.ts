// De contactfiche van een syndicuskantoor staat los van de VME's die erbij horen:
// zo kan een syndicus al bekend zijn vóór de eerste taak, en blijft de fiche
// bewaarbaar als een VME later van syndicus verandert.
import {
  syndicusLabel,
  type SyndicusDetailField,
  type SyndicusDetails,
} from "./syndicus";

export const SYNDICUS_DIR_FIELDS = [
  "company",
  "contact",
  "vat_number",
  "street",
  "house_number",
  "postal_code",
  "city",
  "phone",
  "email",
  "billing_email",
] as const;

export type SyndicusDirField = (typeof SYNDICUS_DIR_FIELDS)[number];
export type SyndicusDirInput = Partial<Record<SyndicusDirField, string | null | undefined>>;
export type SyndicusDir = { id: string } & Record<SyndicusDirField, string | null>;
/** Een klaargezette fiche: alles string of null, met een bedrijfsnaam die er zeker is. */
export type SyndicusDirValues = Record<SyndicusDirField, string | null> & { company: string };

/** Zelfde naam, hoe hij ook geschreven is: letters, accenten en dubbele spaties tellen niet. */
export const syndicusKey = (name: string | null | undefined) =>
  (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * De fiche vóór opslag: spaties weg, lege velden worden null. Een fiche zonder
 * bedrijfsnaam bestaat niet, want daar hangt de VME aan op.
 */
export function syndicusDirPatch(input: SyndicusDirInput): SyndicusDirValues {
  const out = {} as Record<SyndicusDirField, string | null>;
  for (const f of SYNDICUS_DIR_FIELDS) out[f] = input[f]?.trim() || null;
  const company = out.company;
  if (!company) throw new Error("De bedrijfsnaam van de syndicus mag niet leeg zijn.");
  return out as SyndicusDirValues;
}

const CUSTOMER_FIELD = (f: SyndicusDirField): SyndicusDetailField => `syndicus_${f}` as SyndicusDetailField;

/** Wat bij een klant bewaard wordt, uit een contactfiche gehaald. */
export function customerDetailsFromDir(dir: SyndicusDirInput): SyndicusDetails {
  const out: SyndicusDetails = {};
  for (const f of SYNDICUS_DIR_FIELDS) out[CUSTOMER_FIELD(f)] = dir[f]?.trim() || null;
  return out;
}

/** De syndicusgegevens die een klant bij zich draagt, terug als contactfiche. */
export function dirFromCustomer(c: Record<string, unknown>): SyndicusDirInput {
  const out: SyndicusDirInput = {};
  for (const f of SYNDICUS_DIR_FIELDS) out[f] = (c[CUSTOMER_FIELD(f)] as string | null | undefined) ?? null;
  return out;
}

/**
 * Twee versies van dezelfde fiche samenvoegen: wat ingevuld is telt, wat leeg is
 * laat het bestaande staan. Zo wist een klantbewerking met lege velden de fiche
 * niet, en een gecorrigeerd telefoonnummer schrijft het oude wel over.
 */
export function mergeSyndicusDir(current: SyndicusDirInput, incoming: SyndicusDirInput): SyndicusDirValues {
  const out = {} as Record<SyndicusDirField, string | null>;
  for (const f of SYNDICUS_DIR_FIELDS) out[f] = incoming[f]?.trim() || current[f]?.trim() || null;
  const company = out.company;
  if (!company) throw new Error("De bedrijfsnaam van de syndicus mag niet leeg zijn.");
  return out as SyndicusDirValues;
}

export type SyndicusCustomer = {
  id: string;
  name: string;
  syndicus?: string | null;
  syndicus_company?: string | null;
};

export type SyndicusGroup<T> = {
  key: string;
  label: string;
  dir: SyndicusDir | null;
  rows: T[];
};

/**
 * Eén regel per syndicus: fiches uit de contactenlijst en VME's die er al aan
 * hangen. Een fiche zonder VME blijft zichtbaar, en een syndicus die alleen uit
 * mails of oude klanten komt ook.
 */
export function syndicusGroups<T extends SyndicusCustomer>(customers: T[], directory: SyndicusDir[]): SyndicusGroup<T>[] {
  const byKey = new Map<string, SyndicusGroup<T>>();
  const group = (key: string): SyndicusGroup<T> => {
    const found = byKey.get(key);
    if (found) return found;
    const fresh: SyndicusGroup<T> = { key, label: key, dir: null, rows: [] };
    byKey.set(key, fresh);
    return fresh;
  };
  for (const d of directory) {
    const key = syndicusKey(d.company);
    if (!key) continue;
    const g = group(key);
    g.dir = d;
    g.label = syndicusLabel({ syndicus_company: d.company, syndicus_contact: d.contact }) ?? (d.company ?? "").trim();
  }
  for (const c of customers) {
    const name = c.syndicus_company?.trim() || c.syndicus?.trim() || "";
    if (!name) continue;
    const g = group(syndicusKey(name));
    g.rows.push(c);
    if (g.label === g.key) g.label = c.syndicus?.trim() || name;
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, "nl"));
}
