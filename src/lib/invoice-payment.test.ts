import { afterEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { createInvoicePdf, type InvoicePdfData } from './invoice-pdf';
import { invoiceUbl } from './invoice-ubl';

const invoice: InvoicePdfData = {
  number: '20260817', issueDate: '2026-10-30', dueDate: '2026-11-13', workOrderNumber: 85,
  customer: { name: 'Testklant', email: null, address: null, siteAddress: null, vatNumber: null, street: null, houseNumber: null, postalCode: null, city: null },
  lines: [{ description: 'Interventie', quantity: 1, unit: 'st', unitPrice: 100, amount: 100 }],
  vatRate: 21, net: 100, vat: 21, total: 121, paidAmount: 20.5,
  company: { name: 'Riory bv', vat: 'BE0840931404', iban: 'BE71096123456769', bic: 'GEBABEBB' }, terms: null,
};
afterEach(() => vi.restoreAllMocks());
describe('Factuurbetaling', () => {
  it('geeft de UBL dezelfde gestructureerde mededeling zonder factuurnummer te wijzigen', () => {
    const xml = invoiceUbl(invoice, { senderId: '0208:0840931404', receiverId: null, pdfBase64: '' });
    expect(xml).toContain('<cbc:PaymentID>+++002/0260/81739+++</cbc:PaymentID>');
    expect(xml).toContain('<cbc:ID>20260817</cbc:ID>');
  });
  it('neemt een echte betaalcode met enkel het resterende saldo op in de PDF', async () => {
    const qr = vi.spyOn(QRCode, 'toDataURL');
    const pdf = await createInvoicePdf(invoice);
    const payload = String(qr.mock.calls[0]?.[0]).split('\n');
    expect(payload[6]).toBe('BE71096123456769');
    expect(payload[7]).toBe('EUR100.50');
    expect(payload[10]).toBe('+++002/0260/81739+++');
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toContain('%PDF-');
  });
  it('neemt geen betaalcode op wanneer niets meer te betalen is', async () => {
    const qr = vi.spyOn(QRCode, 'toDataURL');
    await createInvoicePdf({ ...invoice, paidAmount: 121 });
    expect(qr).not.toHaveBeenCalled();
  });
  it('neemt geen betaalcode op bij een terugbetaling', async () => {
    const qr = vi.spyOn(QRCode, 'toDataURL');
    await createInvoicePdf({ ...invoice, total: -121, paidAmount: 0, title: 'CREDITNOTA' });
    expect(qr).not.toHaveBeenCalled();
  });
});