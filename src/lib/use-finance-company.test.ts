import { describe, expect, it } from "vitest";
import { resolveFinanceCompany } from "./use-finance-company";

describe("bedrijfskeuze Finance en Boekhouding", () => {
  const companies = [{ id: "riory" }, { id: "syncro19" }];
  it("behoudt Syncro19 in plaats van terug te vallen op Riory", () => {
    expect(resolveFinanceCompany(companies, "syncro19")).toBe("syncro19");
  });
  it("gebruikt geen bedrijf dat niet in de toegankelijke lijst staat", () => {
    expect(resolveFinanceCompany(companies, "ander-bedrijf")).toBe("riory");
    expect(resolveFinanceCompany([], "syncro19")).toBe("");
  });
});