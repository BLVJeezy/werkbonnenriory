import { describe, expect, it } from "vitest";
import { resolveFinanceCompany } from "./use-finance-company";
import { rioryCompanies } from "./finance-company-scope";

describe("bedrijfskeuze Finance en Boekhouding", () => {
  const companies = rioryCompanies([{ id: "riory", name: "Riory BV" }, { id: "syncro19", name: "Syncro19" }, { id: "private", name: "Privé" }]);
  it("toont uitsluitend Riory, nooit Syncro19 of Privé", () => {
    expect(companies.map((company) => company.id)).toEqual(["riory"]);
    expect(resolveFinanceCompany(companies, "syncro19")).toBe("riory");
  });
  it("valt zonder Riory niet terug op Syncro19", () => {
    expect(resolveFinanceCompany(rioryCompanies([{ id: "syncro19", name: "Syncro19" }]), "syncro19")).toBe("");
  });
  it("gebruikt geen bedrijf dat niet in de toegankelijke lijst staat", () => {
    expect(resolveFinanceCompany(companies, "ander-bedrijf")).toBe("riory");
    expect(resolveFinanceCompany([], "syncro19")).toBe("");
  });
});