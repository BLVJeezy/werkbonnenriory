import { describe, expect, it } from 'vitest';
import { parsePurchaseUbl } from './purchase-booking';
import { peppolTestInvoiceData, peppolTestInvoiceUbl } from './peppol-test-invoice';

const company = { name: 'Riory BV', vat: 'BE0840931404', iban: 'BE52001907467109', bic: null };
const participantId = '0208:0840931404';

describe('peppol test invoice', () => {
  it('is read back by the purchase-invoice parser with supplier, lines and totals', () => {
    const data = peppolTestInvoiceData(company, '2026-11-04');
    const p = parsePurchaseUbl(peppolTestInvoiceUbl(data, participantId, participantId, 'AA=='));
    expect(p.kind).toBe('factuur');
    expect(p.supplierName).toBe('Riory BV');
    expect(p.supplierVat).toBe('BE0840931404');
    expect(p.supplierIban).toBe('BE52001907467109');
    expect(p.invoiceNumber).toBe('TEST-20261104');
    expect(p.invoiceDate).toBe('2026-11-04');
    expect(p.dueDate).toBe('2026-11-19');
    expect(p.lines.map(l => l.description)).toEqual(['Testlijn 1: dieptereiniging regenput', 'Testlijn 2: verbruiksmaterialen']);
    expect(p.lines.map(l => l.amount)).toEqual([250, 91]);
    expect(p.net).toBe(341);
    expect(p.vat).toBe(71.61);
    expect(p.total).toBe(412.61);
    expect(p.pdfBase64).toBe('AA==');
  });

  it('keeps the bank reference rule by staying under ten digits', () => {
    const data = peppolTestInvoiceData(company, '2026-11-04');
    expect(data.number.replace(/\D/g, '')).toBe('20261104');
    expect(peppolTestInvoiceUbl(data, participantId, participantId, '')).toContain('<cbc:DueDate>2026-11-19</cbc:DueDate>');
    expect(peppolTestInvoiceUbl(data, participantId, participantId, '')).not.toContain('EmbeddedDocumentBinaryObject');
  });
});
