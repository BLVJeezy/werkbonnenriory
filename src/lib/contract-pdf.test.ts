import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createContractPdf, nextContractNumber } from "./contract-pdf";

describe("nextContractNumber", () => {
  it("stelt het volgende volgnummer voor binnen hetzelfde jaar", () => {
    expect(nextContractNumber(["2026/00001", "2026/00002", "2023/0012", null], 2026)).toBe("2026/00003");
    expect(nextContractNumber(["2023/0008"], 2026)).toBe("2026/00001");
  });
});

describe("createContractPdf", () => {
  it("genereert een geldige PDF met het contract en de bijgevoegde algemene voorwaarden", async () => {
    const bytes = await createContractPdf({
      number: "2026/00003",
      name: "Dakgootreiniging 2x jaarlijks",
      date: "2026-11-20",
      startDate: "2027-02-28",
      repeatEvery: 6,
      repeatUnit: "maand",
      description: "Reisvergoeding gratis. Alle gevels toegankelijk.",
      company: { name: "Riory BV", vat: "BE0840931404", address: "Natveld 47, 3740 Bilzen", kmRate: 1.45 },
      customer: { name: "VME Res. WIJKMOLEN", address: "Molenstraat 45, 3700 Tongeren", vatNumber: "0462631107", email: "syndicus@confideo.be" },
      lines: [
        { description: "Dakgootreiniging 2 verdiepen voorkant", quantity: 27, unit: "St", unitPrice: 8.48, discount: 0, vatRate: 6 },
        { description: "Dakgootreiniging 2 verdiepen achterkant", quantity: 18, unit: "St", unitPrice: 8.48, discount: 0, vatRate: 6 },
      ],
    });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(5);
  });
});