import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { Blob } from 'node:buffer';
import { accountantPurchaseUbl, accountantSalesUbl } from './accountant-documents.server';

vi.mock('./invoice-sending.server', () => ({ pdfData: async (_: unknown, inv: any) => ({
  number: inv.number, issueDate: '2026-11-02', dueDate: '2026-11-16', workOrderNumber: 0,
  customer: { name: 'Testklant', email: '', street: 'Teststraat', houseNumber: '1', postalCode: '3740', city: 'Bilzen', vatNumber: null },
  lines: [{ description: 'Credit', quantity: 1, unit: 'st', unitPrice: -100, amount: -100 }],
  vatRate: 21, net: -100, vat: -21, total: -121, paidAmount: 0,
  company: { name: 'Riory BV', vat: 'BE0840931404', iban: null, bic: null }, terms: null, title: 'CREDITNOTA',
}) }));

describe('accountant sales document generation', () => {
  for (const number of ['20260845', '20260847', '20260895']) {
    it(`includes credit note ${number} with a readable actual PDF and valid credit fields`, async () => {
      const query: any = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: null, error: null }) };
      const xml = await accountantSalesUbl({ from: () => query }, { id: number, number, kind: 'creditnota' });
      expect(xml).toContain(`<cbc:ID>${number}</cbc:ID>`);
      expect(xml).toContain('<cbc:CreditNoteTypeCode>381');
      expect(xml).not.toContain('<cbc:DueDate>');
      const base64 = xml.match(/<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)/)?.[1] ?? '';
      const pdf = await PDFDocument.load(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
      expect(pdf.getPageCount()).toBeGreaterThan(0);
    });
  }
  it('uses the accepted customer PDF snapshot without regenerating it', async () => {
    const original = btoa('%PDF-1.7 accepted snapshot');
    const query: any = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: { pdf_base64: original }, error: null }) };
    const xml = await accountantSalesUbl({ from: () => query }, { id: 'x', number: '20260847', kind: 'creditnota' });
    expect(xml).toContain(`>${original}</cbc:EmbeddedDocumentBinaryObject>`);
  });
});

describe('private purchase originals', () => {
  it('reads the supplier UBL and inserts the stored source PDF without rewriting supplier data', async () => {
    const original = '<Invoice><cbc:ID>5704268246</cbc:ID><cac:AccountingSupplierParty>Google Ireland</cac:AccountingSupplierParty></Invoice>';
    const storage = { download: vi.fn(async (path: string) => ({ data: new Blob([path.endsWith('.xml') ? original : '%PDF-1.7 supplier original'], { type: path.endsWith('.xml') ? 'application/xml' : 'application/pdf' }), error: null })) };
    const xml = await accountantPurchaseUbl({ storage: { from: () => storage } }, { original_ubl_path: 'source.xml', pdf_path: 'source.pdf', invoice_number: '5704268246' }, { name: 'Riory BV', vat: 'BE0840931404' });
    expect(storage.download).toHaveBeenCalledWith('source.xml');
    expect(storage.download).toHaveBeenCalledWith('source.pdf');
    expect(xml).toContain('<cbc:ID>5704268246</cbc:ID>');
    expect(atob(xml.match(/<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)/)?.[1] ?? '')).toBe('%PDF-1.7 supplier original');
  });
});