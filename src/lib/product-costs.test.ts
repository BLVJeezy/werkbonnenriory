import { describe, expect, it } from "vitest";
import { costKey, productCostLines } from "./product-costs";

describe("costKey", () => {
  it("regenput enkel bij Rioclean, septisch bij elke leverancier", () => {
    expect(costKey("BVBA RIOCLEAN", "Ledigen en reinigen regenwaterput")).toBe("regenput");
    expect(costKey("Kwim", "Ledigen en reinigen regenwaterput")).toBeNull();
    expect(costKey("Huls Wim", "Ledigen septische put Hazelereik 36")).toBe("septisch");
  });
  it("riostoppen enkel bij IDBS en enkel wanneer de lijn over riostoppen gaat", () => {
    expect(costKey("IDBS RIOOLTECHNIEK", "Verkoop Riostoppen")).toBe("riostop");
    expect(costKey("IDBS Riooltechniek", "Verkoop riostoppen")).toBe("riostop");
    expect(costKey("IDBS RIOOLTECHNIEK", "totaal")).toBeNull();
    expect(costKey("IDBS RIOOLTECHNIEK", "Ontstoppen riolering in kelder + combi camera-tracing")).toBeNull();
    expect(costKey("Kwim", "Verkoop riostoppen")).toBeNull();
  });
  it("telt een Simpla-factuur die ook in de app staat maar één keer", () => {
    const res = productCostLines(
      { bills: [{ billDatabaseId: 1, billCustomerId: 9, billDate: "2026-05-01", documentId: "263009" }], lines: [{ billDatabaseId: 1, billLineProductDescription: "Ledigen septische put", billLineUnitPrice: 180, billLineNumber: 1 }], suppliers: [{ supplierId: 9, supplierName: "BVBA RIOCLEAN" }] },
      [{ supplier_name: "BVBA Rioclean", invoice_number: "263009", invoice_date: "2026-05-01", lines: [{ description: "Ledigen septische put", amount: 180 }] }],
      "2026-01-01", "2026-12-31",
    );
    expect(res).toEqual([{ key: "septisch", date: "2026-05-01", amount: 180 }]);
  });
  it("telt IDBS-riostoppen als kost en laat een concept staan", () => {
    const res = productCostLines(
      {
        bills: [
          { billDatabaseId: 1, billCustomerId: 36, billDate: "2026-03-10", documentId: "2026-0374", billStatus: "LOCKED" },
          { billDatabaseId: 2, billCustomerId: 36, billDate: "2026-10-27", documentId: "2027-0036", billStatus: "DRAFT" },
          { billDatabaseId: 3, billCustomerId: 36, billDate: "2026-10-13", documentId: "2027-0018", billStatus: "LOCKED" },
        ],
        lines: [
          { billDatabaseId: 1, billLineProductDescription: "Verkoop Riostoppen", billLineUnitPrice: 9, billLineNumber: 50 },
          { billDatabaseId: 2, billLineProductDescription: "Verkoop riostoppen", billLineUnitPrice: 9, billLineNumber: 50 },
          { billDatabaseId: 3, billLineProductDescription: "Ontstoppen riolering in kelder + combi camera-tracing", billLineUnitPrice: 350, billLineNumber: 1 },
        ],
        suppliers: [{ supplierId: 36, supplierName: "IDBS RIOOLTECHNIEK" }],
      },
      [], "2023-01-01", "2026-12-31",
    );
    expect(res).toEqual([{ key: "riostop", date: "2026-03-10", amount: 450 }]);
  });
});
