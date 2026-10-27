import { describe, expect, it } from "vitest";
import { buildPain001, isValidOgm } from "./pain001";

const debtor = { name: "Riory bv", iban: "BE12 3456 7890 1234", bic: "GEBABEBB" };

describe("isValidOgm", () => {
  it("aanvaardt een geldige OGM met mod-97", () => {
    // 1234567890 % 97 = 2 → +++123/4567/89002+++
    expect(isValidOgm("+++123/4567/89002+++")).toBe(true);
  });
  it("weigert een OGM met fout controlegetal", () => {
    expect(isValidOgm("+++123/4567/89012+++")).toBe(false);
  });
  it("weigert vrije tekst", () => {
    expect(isValidOgm("factuur 2026-1042")).toBe(false);
  });
});

describe("buildPain001", () => {
  it("groepeert betalingen per vervaldag met juiste totalen", () => {
    const xml = buildPain001(debtor, [
      { creditorName: "Desco", creditorIban: "BE71 0961 2345 6769", amount: 30.25, remittance: "factuur 2026-1042", executionDate: "2026-11-03", endToEndId: "PI-1" },
      { creditorName: "Sonepar", creditorIban: "BE68 5390 0754 7034", amount: 100, remittance: "+++123/4567/89002+++", executionDate: "2026-11-03", endToEndId: "PI-2" },
      { creditorName: "Gazet", creditorIban: "BE44 0000 0000 0000", amount: 10, remittance: null, executionDate: "2026-11-10", endToEndId: "PI-3" },
    ], "RIORY-20261027");
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"');
    expect(xml).toContain("<NbOfTxs>3</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>140.25</CtrlSum>");
    expect(xml.match(/<ReqdExctnDt>/g)).toHaveLength(2);
    expect(xml).toContain("<ReqdExctnDt>2026-11-03</ReqdExctnDt>");
    expect(xml).toContain("<ReqdExctnDt>2026-11-10</ReqdExctnDt>");
    expect(xml).toContain("<IBAN>BE71096123456769</IBAN>");
    expect(xml).toContain("<Ref>+++123/4567/89002+++</Ref>");
    expect(xml).toContain("<Ustrd>factuur 2026-1042</Ustrd>");
  });

  it("escapet XML in namen", () => {
    const xml = buildPain001(debtor, [
      { creditorName: "A & B <bouw>", creditorIban: "BE71096123456769", amount: 1, remittance: null, executionDate: "2026-11-03", endToEndId: "PI-1" },
    ], "M1");
    expect(xml).toContain("A &amp; B &lt;bouw&gt;");
  });

  it("weigert een leeg bestand en ongeldige bedragen", () => {
    expect(() => buildPain001(debtor, [], "M1")).toThrow();
    expect(() => buildPain001(debtor, [{ creditorName: "X", creditorIban: "BE1", amount: 0, remittance: null, executionDate: "2026-11-03", endToEndId: "E" }], "M1")).toThrow();
  });
});
