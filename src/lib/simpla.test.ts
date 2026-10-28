import { describe, expect, it } from "vitest";
import { matchSimplaCustomer, mapSimplaPurchases } from "./simpla";
describe("Simpla klantkoppeling", () => {
  it("koppelt op e-mail met voorrang boven naam", () => {
    expect(matchSimplaCustomer([{ customerId: 1, customerName: "Riory" }, { customerId: 2, customerEmail: " INFO@RIORY.BE " }], "Riory", "info@riory.be")?.customerId).toBe(2);
  });
  it("koppelt een unieke naam zonder e-mail", () => {
    expect(matchSimplaCustomer([{ customerId: 3, customerName: "Klant" }], " klant ", null)?.customerId).toBe(3);
  });
  it("weigert dubbele of geblokkeerde klanten", () => {
    expect(matchSimplaCustomer([{ customerName: "Klant" }, { customerName: "Klant" }], "Klant", null)).toBeNull();
    expect(matchSimplaCustomer([{ customerName: "Klant", isBlocked: true }], "Klant", null)).toBeNull();
  });
});

describe("mapSimplaPurchases", () => {
  it("skips paid bills and maps supplier and lines", () => {
    const r = mapSimplaPurchases(
      [{ billDatabaseId: 1, billCustomerId: 9, documentId: "F1", dueDate: "2026-11-09T00:00:00", billTotalIncVAT: 12.49 }, { billDatabaseId: 2, paymentDate: "2026-10-01" }],
      [{ billDatabaseId: 1, billLineUnitPrice: 10, billLineNumber: 2, billLineDiscount: 10 }],
      [{ supplierId: 9, supplierName: "Tuincentrum", supplierIBAN: "BE29 7310" }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ supplier_name: "Tuincentrum", supplier_iban: "BE297310", due_date: "2026-11-09", total: 12.49 });
    expect(r[0]?.lines[0]?.amount).toBe(18);
  });
});
