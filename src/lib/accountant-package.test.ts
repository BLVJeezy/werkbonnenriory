import { describe, expect, it } from "vitest";
import { accountantWarnings, attachmentBatches, monthsInPeriod, normalizePeriod, periodLabel, periodSlug, purchaseUbl, withSourceDocument } from "./accountant-package";

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
  it("refuses a start date after the end date", () => expect(() => normalizePeriod({ from: "2026-04-01", to: "2026-03-31" })).toThrow("begindatum"));
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

describe('actual source document in accountant UBL', () => {
  const source = { name: 'Google-factuur.pdf', mime: 'application/pdf', base64: btoa('%PDF-1.7 original supplier invoice') };
  const xml = purchaseUbl({ supplier_name: 'Google Ireland', supplier_vat: 'IE6388047V', supplier_iban: null, invoice_number: '5704268246', invoice_date: '2026-09-30', due_date: null, kind: 'factuur', net: 567.07, vat: 0, total: 567.07, lines: [] }, { name: 'Riory BV', vat: 'BE0840931404' });
  it('includes the supplier document bytes, not only extracted values', () => {
    const result = withSourceDocument(xml, source);
    expect(atob(result.match(/<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)/)?.[1] ?? '')).toBe('%PDF-1.7 original supplier invoice');
    expect(result).toContain('<cbc:PayableAmount currencyID="EUR">567.07');
  });
  it('preserves the received UBL unchanged when a PDF is already embedded', () => {
    const original = withSourceDocument(xml, source);
    expect(withSourceDocument(original, { ...source, base64: btoa('other') })).toBe(original);
  });
  it('blocks exports without the original document', () => {
    expect(() => withSourceDocument(xml, { ...source, base64: '' })).toThrow('Origineel document ontbreekt');
  });
  it('retains actual supplier UBL using ns3/ns4 namespaces', () => {
    const original = `<Invoice xmlns:ns3="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:ns4="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><ns4:ID>926394878159</ns4:ID><ns3:AccountingSupplierParty>Supplier</ns3:AccountingSupplierParty></Invoice>`;
    const result = withSourceDocument(original, source);
    expect(result).toContain(`<ns4:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="Google-factuur.pdf">${source.base64}</ns4:EmbeddedDocumentBinaryObject>`);
    expect(result).toContain('<ns4:ID>926394878159</ns4:ID>');
    expect(withSourceDocument(result, source)).toBe(result);
  });
});

describe('attachment batching', () => {
  it('retains all files in order over multiple bounded mails', () => {
    const items = ['20260845', '20260847', '20260895'].map(number => ({ number, contentBytes: 'x'.repeat(60) }));
    const batches = attachmentBatches(items, 150);
    expect(batches.length).toBe(3);
    expect(batches.flat()).toEqual(items);
  });
  it('keeps large original documents separately for upload-session delivery', () => {
    const large = { contentBytes: 'x'.repeat(200) };
    expect(attachmentBatches([large], 150)).toEqual([[large]]);
  });
});
