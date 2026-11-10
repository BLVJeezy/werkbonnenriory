export type CustomerContact = { name: string; phone: string; role?: string | undefined };

/** Leest de opgeslagen contactpersonen van een klant (jsonb) veilig uit. */
export function parseContacts(raw: unknown): CustomerContact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => ({ name: String((c as CustomerContact)?.name ?? "").trim(), phone: String((c as CustomerContact)?.phone ?? "").trim(), role: String((c as CustomerContact)?.role ?? "").trim() }))
    .filter((c) => c.name || c.phone);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Voegt een contact toe of werkt het bij (zelfde naam), zonder dubbels. */
export function upsertContact(list: CustomerContact[], c: CustomerContact): CustomerContact[] {
  const name = c.name.trim(), phone = c.phone.trim();
  if (!name && !phone) return list;
  const i = list.findIndex((x) => (name && norm(x.name) === norm(name)) || (!name && norm(x.phone) === norm(phone)));
  const next = { ...c, name, phone };
  if (i < 0) return [...list, next];
  return list.map((x, j) => (j === i ? { ...x, ...next, role: next.role || x.role } : x));
}

export function hasContact(list: CustomerContact[], name: string, phone: string) {
  return list.some((x) => norm(x.name) === norm(name) && norm(x.phone) === norm(phone));
}

/** Contactpersoon uit een mail toevoegen: nooit een bestaand nummer of rol wissen met een leeg veld. */
export function addMailContact(list: CustomerContact[], name: string | null | undefined, phone: string | null | undefined): CustomerContact[] {
  const n = (name ?? "").trim(), p = (phone ?? "").trim();
  if (!n && !p) return list;
  const existing = list.find((x) => (n && norm(x.name) === norm(n)) || (!n && norm(x.phone) === norm(p)));
  return upsertContact(list, { name: n || existing?.name || "", phone: p || existing?.phone || "", role: existing?.role || "" });
}
