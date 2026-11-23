import { describe, expect, it } from "vitest";
import { mapSimplaPurchaseCreditNotes, mapSimplaSalesCreditNotes } from "./simpla-creditnotes";

describe("mapSimplaSalesCreditNotes", () => {
  it("zet Simpla verkoopcreditnota's om met positieve lijnen en cn-<id> referentie", () => {
    const res = mapSimplaSalesCreditNotes(
      [
        { creditnoteDatabaseId: 105, creditnoteNumber: "20260001", creditnoteDate: "2026-01-15", creditnoteState: "SENT", customerDatabaseId: 9 },
        { creditnoteDatabaseId: 104, creditnoteNumber: "20250063", creditnoteDate: "2025-12-20", creditnoteState: "SENT", customerDatabaseId: 9 },
      ],
      [{ creditnoteDatabaseId: 105, creditnotelineDescription: "Correctie", creditnotelineTotalExVAT: 100, creditnotelineTotalIncVAT: 121, creditnotelineVATPercentage: 21 }],
      [{ customerDatabaseId: 9, customerName: "Klant BV" }],
      new Set(["cn-104"]),
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      direction: "verkoop",
      doc_type: "creditnota",
      source_ref: "cn-105",
      number: "20260001",
      counterparty: "Klant BV",
      status: "open",
      paid_amount: 0,
    });
    expect(res[0]?.lines[0]).toMatchObject({ ex_vat: 100, vat: 21, account: "700000" });
  });
});

describe("mapSimplaPurchaseCreditNotes", () => {
  it("neemt alleen negatieve aankoopfacturen op als aankoopcreditnota en slaat positieve over", () => {
    const res = mapSimplaPurchaseCreditNotes(
      [
        { billDatabaseId: 3001, billNumber: "CN-1", billDate: "2026-02-01", billTotalExVAT: -200, billTotalIncVAT: -242, billState: "OPEN", supplierDatabaseId: 4 },
        { billDatabaseId: 3002, billNumber: "F-1", billDate: "2026-02-01", billTotalExVAT: 200, billTotalIncVAT: 242, billState: "OPEN", supplierDatabaseId: 4 },
      ],
      [{ supplierDatabaseId: 4, supplierName: "Leverancier NV" }],
      new Set(),
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      direction: "aankoop",
      doc_type: "creditnota",
      source_ref: "3001",
      counterparty: "Leverancier NV",
      status: "open",
    });
    expect(res[0]?.lines[0]).toMatchObject({ ex_vat: 200, vat: 42, account: "604000" });
  });
});