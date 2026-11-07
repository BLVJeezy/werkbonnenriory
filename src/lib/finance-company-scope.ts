/** This application manages Riory only; never fall back to another company's records. */
export function rioryCompanies<T extends { name: string }>(companies: T[]): T[] {
  return companies.filter((company) => company.name.trim().toLowerCase() === "riory bv");
}