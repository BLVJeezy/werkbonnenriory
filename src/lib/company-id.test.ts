import { describe, expect, it } from "vitest";
import { enterpriseNumber, supplierFooterLine } from "./company-id";

describe("ondernemingsnummer", () => {
  it("haalt het KBO-nummer uit een BE btw-nummer", () => expect(enterpriseNumber("BE0840931404")).toBe("0840.931.404"));
  it("aanvaardt ook kleine letters en punten", () => expect(enterpriseNumber("be 0840.931.404")).toBe("0840.931.404"));
  it("geeft niets terug bij een buitenlands of onvolledig nummer", () => {
    expect(enterpriseNumber("NL123456789B01")).toBeNull();
    expect(enterpriseNumber("BE084093140")).toBeNull();
    expect(enterpriseNumber(null)).toBeNull();
  });
  it("zet het ondernemingsnummer in de pdf-voettekst", () => {
    expect(supplierFooterLine({ name: "Riory bv", vat: "BE0840931404" })).toBe(
      "Riory bv  -  Natveld 47, 3740 Bilzen  -  BE0840931404  -  Ondernemingsnummer 0840.931.404  -  info@riory.be  -  www.riory.be",
    );
  });
});
