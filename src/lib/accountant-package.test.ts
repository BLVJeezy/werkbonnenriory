import { describe, expect, it } from "vitest";
import { accountantWarnings, elapsedMonths, purchaseUbl } from "./accountant-package";

const ok = { purchasesToCheck: 0, salesUnsent: 0, financeToReview: 0, financeUnbooked: 0, bankUnbooked: 0, monthsIncomplete: [], investmentsIncomplete: [], journalLines: 10, trialDiff: 0 };

describe("accountantWarnings", () => {
  it("is empty when everything is complete", () => expect(accountantWarnings(ok)).toEqual([]));
  it("warns about purchases still to check", () => expect(accountantWarnings({ ...ok, purchasesToCheck: 3 })[0]).toContain("3 aankoopfacturen"));
  it("warns when the trial balance does not close", () => expect(accountantWarnings({ ...ok, trialDiff: 12.5 })).toHaveLength(1));
  it("warns when there are no bookings", () => expect(accountantWarnings({ ...ok, journalLines: 0 })[0]).toContain("geen boekingen"));
});

describe("elapsedMonths", () => {
  it("lists only finished months", () => expect(elapsedMonths(2026, "2026-03-15")).toEqual(["2026-01", "2026-02"]));
});

describe("purchaseUbl", () => {
  it("marks credit notes with type code 381", () => {
    const xml = purchaseUbl({ supplier_name: "X", supplier_vat: null, supplier_iban: null, invoice_number: "1", invoice_date: "2026-01-01", due_date: null, kind: "creditnota", net: 100, vat: 21, total: 121, lines: [] }, { name: "Riory BV", vat: "BE0840931404" });
    expect(xml).toContain("<cbc:CreditNoteTypeCode>381");
  });
});
