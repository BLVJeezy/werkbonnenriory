import { describe, expect, it } from "vitest";
import { costKey, productCostLines } from "./product-costs";

describe("costKey", () => {
  it("regenput enkel bij Rioclean, septisch bij elke leverancier", () => {
    expect(costKey("BVBA RIOCLEAN", "Ledigen en reinigen regenwaterput")).toBe("regenput");
    expect(costKey("Kwim", "Ledigen en reinigen regenwaterput")).toBeNull();
    expect(costKey("Huls Wim", "Ledigen septische put Hazelereik 36")).toBe("septisch");
  });
  it("telt een Simpla-factuur die ook in de app staat maar één keer", () => {
    const res = productCostLines(
      { bills: [{ billDatabaseId: 1, billCustomerId: 9, billDate: "2026-05-01", documentId: "263009" }], lines: [{ billDatabaseId: 1, billLineProductDescription: "Ledigen septische put", billLineUnitPrice: 180, billLineNumber: 1 }], suppliers: [{ supplierId: 9, supplierName: "BVBA RIOCLEAN" }] },
      [{ supplier_name: "BVBA Rioclean", invoice_number: "263009", invoice_date: "2026-05-01", lines: [{ description: "Ledigen septische put", amount: 180 }] }],
      "2026-01-01", "2026-12-31",
    );
    expect(res).toEqual([{ key: "septisch", date: "2026-05-01", amount: 180 }]);
  });
});
