import { describe, expect, it } from "vitest";
import { accountantWarnings, monthsInPeriod, normalizePeriod, periodLabel, periodSlug, purchaseUbl } from "./accountant-package";

const ok = { purchasesToCheck: 0, salesUnsent: 0, financeToReview: 0, financeUnbooked: 0, bankUnbooked: 0, monthsIncomplete: [], investmentsIncomplete: [], journalLines: 10, trialDiff: 0 };

describe("accountantWarnings", () => {
  it("is empty when everything is complete", () => expect(accountantWarnings(ok)).toEqual([]));
  it("warns about purchases still to check", () => expect(accountantWarnings({ ...ok, purchasesToCheck: 3 })[0]).toContain("3 aankoopfacturen"));
  it("warns when the trial balance does not close", () => expect(accountantWarnings({ ...ok, trialDiff: 12.5 })).toHaveLength(1));
  it("warns when there are no bookings", () => expect(accountantWarnings({ ...ok, journalLines: 0 })[0]).toContain("geen boekingen"));
});

describe("monthsInPeriod", () => {
  it("lists only finished months inside the period", () => expect(monthsInPeriod("2026-03-15", "2026-11-30", "2026-05-06")).toEqual(["2026-03", "2026-04"]));
  it("keeps months of a period that spans years", () => expect(monthsInPeriod("2025-11-01", "2026-02-28", "2026-05-06")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]));
});

describe("normalizePeriod", () => {
  it("keeps a valid start and end date", () => expect(normalizePeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-03-01", to: "2026-03-31" }));
  it("refuses a start date after the end date", () => expect(() => normalizePeriod({ from: "2026-04-01", to: "2026-03-31" })).toThrow("begindatum");
  it("refuses dates that are not jjjj-mm-dd", () => expect(() => normalizePeriod({ from: "01/03/2026", to: "2026-03-31" })).toThrow("geldige begin- en einddatum"));
  it("refuses years outside 2000-2100", () => expect(() => normalizePeriod({ from: "1999-01-01", to: "1999-12-31" })).toThrow("2000"));
});

describe("periodLabel", () => {
  it("reads the same way in mails and on screen", () => {
    expect(periodLabel("2026-01-01", "2026-12-31")).toBe("01/01/2026 tot 31/12/2026");
    expect(periodSlug("2026-01-01", "2026-12-31")).toBe("2026-01-01_tot_2026-12-31");
  });
});

describe("purchaseUbl", () => {
  it("marks credit notes with type code 381", () => {
    const xml = purchaseUbl({ supplier_name: "X", supplier_vat: null, supplier_iban: null, invoice_number: "1", invoice_date: "2026-01-01", due_date: null, kind: "creditnota", net: 100, vat: 21, total: 121, lines: [] }, { name: "Riory BV", vat: "BE0840931404" });
    expect(xml).toContain("<cbc:CreditNoteTypeCode>381");
  });
});
