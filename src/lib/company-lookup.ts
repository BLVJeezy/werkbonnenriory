export type CompanyDetails = {
  name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
};

export function companyNumber(input: string): { countryCode: string; vatNumber: string } | null {
  const value = input.toUpperCase().replace(/[\s.-]/g, "");
  const belgian = value.replace(/^BE/, "");
  if (/^\d{9,10}$/.test(belgian)) return { countryCode: "BE", vatNumber: belgian.padStart(10, "0") };
  if (/^NL\d{9}B\d{2}$/.test(value)) return { countryCode: "NL", vatNumber: value.slice(2) };
  return null;
}

const clean = (value: unknown): string => typeof value === "string" && value.trim() !== "---" ? value.trim() : "";

export function companyDetails(payload: Record<string, unknown>): CompanyDetails {
  const result: CompanyDetails = { name: clean(payload["name"]), street: "", house_number: "", postal_code: "", city: "" };
  const lines = clean(payload["address"]).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const locality = lines.findIndex(s => /^\d{4}(?:\s?[A-Z]{2})?\s+\S/i.test(s));
  const match = locality >= 0 ? lines[locality]?.match(/^(\d{4}(?:\s?[A-Z]{2})?)\s+(.+)$/i) : null;
  if (match) {
    result.postal_code = match[1] ?? "";
    result.city = match[2] ?? "";
    const street = locality > 0 ? lines[locality - 1] : undefined;
    const parts = street?.match(/^(.+?)\s+(\d+.*)$/);
    if (parts) {
      result.street = parts[1] ?? "";
      result.house_number = parts[2] ?? "";
    } else result.street = street ?? "";
  }
  return result;
}

/** Only fill blank fields. An existing address is kept as one coherent unit. */
export function fillCompanyDetails(form: Record<string, string>, details: CompanyDetails): Record<string, string> {
  const next = { ...form };
  if (!next["name"]?.trim() && details.name) next["name"] = details.name;
  const address = ["street", "house_number", "postal_code", "city"] as const;
  if (!address.some(key => next[key]?.trim())) {
    for (const key of address) if (details[key]) next[key] = details[key];
  }
  return next;
}