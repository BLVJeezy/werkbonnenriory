import { describe, expect, it } from "vitest";
import { allowedSearchCategories, sanitizeSearchTerm } from "./global-search";

describe("global-search helpers", () => {
  it("verwijdert speciale PostgREST-tekens uit zoektermen", () => {
    expect(sanitizeSearchTerm("  Deschacht, (NV)%  ")).toBe("Deschacht NV");
    expect(sanitizeSearchTerm("2026-0893")).toBe("2026-0893");
  });

  it("beperkt zoekcategorieën per rol", () => {
    expect(allowedSearchCategories("admin")).toContain("purchase_invoices");
    expect(allowedSearchCategories("admin")).toContain("bank_tx");
    expect(allowedSearchCategories("marketing")).toEqual(["customers"]);
    expect(allowedSearchCategories("technician")).toEqual(["work_orders"]);
    expect(allowedSearchCategories(null)).toEqual([]);
  });
});