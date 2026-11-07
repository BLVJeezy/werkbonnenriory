import { describe, expect, it } from "vitest";
import { companyDetails, companyNumber, fillCompanyDetails } from "./company-lookup";

describe("company lookup", () => {
  it("accepts Belgian enterprise numbers without a VAT prefix", () => {
    expect(companyNumber("0840.931.404")).toEqual({ countryCode: "BE", vatNumber: "0840931404" });
    expect(companyNumber("BE 0840.931.404")).toEqual(companyNumber("0840931404"));
  });
  it("accepts Dutch VAT numbers and rejects arbitrary input", () => {
    expect(companyNumber("NL123456789B01")).toEqual({ countryCode: "NL", vatNumber: "123456789B01" });
    expect(companyNumber("https://example.com")).toBeNull();
    expect(companyNumber("123")).toBeNull();
  });
  it("splits the actual Riory official address", () => {
    expect(companyDetails({ name: "BV RIORY", address: "Natveld 47\n3740 Bilzen-Hoeselt" })).toEqual({ name: "BV RIORY", street: "Natveld", house_number: "47", postal_code: "3740", city: "Bilzen-Hoeselt" });
  });
  it("splits Dutch addresses without losing suffixes", () => {
    expect(companyDetails({ name: "Bedrijf", address: "Teststraat 12 A\n1234 AB Maastricht" })).toMatchObject({ street: "Teststraat", house_number: "12 A", postal_code: "1234 AB", city: "Maastricht" });
  });
  it("fills blank customer fields without copying syndicus or contact data", () => {
    const details = companyDetails({ name: "BV RIORY", address: "Natveld 47\n3740 Bilzen-Hoeselt" });
    expect(fillCompanyDetails({ email: "klant@example.be", syndicus_company: "Kantoor", vat_number: "0840931404", vrij_beroep: "1" }, details)).toEqual({ ...details, email: "klant@example.be", syndicus_company: "Kantoor", vat_number: "0840931404", vrij_beroep: "1" });
  });
  it("never overwrites an existing VME name or mixes an existing address", () => {
    const details = companyDetails({ name: "BV RIORY", address: "Natveld 47\n3740 Bilzen-Hoeselt" });
    expect(fillCompanyDetails({ name: "VME Parkzicht", street: "Eigen straat" }, details)).toEqual({ name: "VME Parkzicht", street: "Eigen straat" });
  });
  it("does not interpret withheld names or unparseable addresses as real data", () => {
    expect(companyDetails({ name: "---", address: "---" })).toEqual({ name: "", street: "", house_number: "", postal_code: "", city: "" });
  });
});