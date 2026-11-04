/** Het ondernemingsnummer (KBO/BCE) is voor Belgische ondernemingen hetzelfde cijfer als het btw-nummer, zonder de landcode "BE". */
export function enterpriseNumber(vat: string | null | undefined): string | null {
  if (!vat) return null;
  const digits = vat.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^BE/, "");
  if (!/^\d{10}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
}

/** Voettekst voor pdf-documenten: firma, adres, btw, ondernemingsnummer en contact. */
export const supplierFooterLine = (company: { name: string; vat: string }) => {
  const ent = enterpriseNumber(company.vat);
  return [company.name, "Natveld 47, 3740 Bilzen", company.vat, ent ? `Ondernemingsnummer ${ent}` : "", "info@riory.be", "www.riory.be"]
    .filter(Boolean)
    .join("  -  ");
};
