import { describe, expect, it } from 'vitest';
import { invoiceVatNotices, RENOVATION_VAT_NOTICE, REVERSE_CHARGE_VAT_NOTICE } from './invoice-vat-notices';
import { invoiceUbl } from './invoice-ubl';
import type { InvoicePdfData } from './invoice-pdf';

const invoice: InvoicePdfData = { number: 'TEST', issueDate: '2026-10-28', dueDate: '2026-11-11', workOrderNumber: 1, customer: { name: 'Test', address: null, siteAddress: null, vatNumber: null, email: null, street: null, houseNumber: null, postalCode: null, city: null }, lines: [{ description: 'Herstelling', quantity: 1, unit: 'st', unitPrice: 100, amount: 100 }], vatRate: 21, net: 100, vat: 21, total: 121, paidAmount: 0, company: { name: 'Riory', vat: 'BE0840931404', iban: null, bic: null }, terms: null };
describe('Verplichte Belgische factuurvermeldingen', () => {
  it('selecteert de renovatieverklaring bij 6%', () => expect(invoiceVatNotices({ ...invoice, vatRate: 6 }).map(n => n.text)).toEqual([RENOVATION_VAT_NOTICE]));
  it('selecteert de volledige verleggingsverklaring bij 0% met btw-nummer', () => expect(invoiceVatNotices({ ...invoice, vatRate: 0, customer: { vatNumber: 'BE0840931404' } }).map(n => n.text)).toEqual([REVERSE_CHARGE_VAT_NOTICE]));
  it('noemt 0% zonder btw-nummer geen verlegging', () => expect(invoiceVatNotices({ ...invoice, vatRate: 0 })).toEqual([]));
  it('selecteert geen verklaring bij 21% of 12%', () => { expect(invoiceVatNotices(invoice)).toEqual([]); expect(invoiceVatNotices({ ...invoice, vatRate: 12 })).toEqual([]); });
  it('beoordeelt elke lijn bij gemengde tarieven en neemt teksten eenmaal op', () => { const lines = [21, 6, 0, 6].map(vatRate => ({ ...invoice.lines[0], description: 'Werk', quantity: 1, unit: 'st', unitPrice: 100, amount: 100, vatRate })); expect(invoiceVatNotices({ ...invoice, lines, customer: { vatNumber: 'BE0840931404' } }).map(n => n.text)).toEqual([RENOVATION_VAT_NOTICE, REVERSE_CHARGE_VAT_NOTICE]); });
  it('neemt dezelfde toepasselijke verklaring mee in UBL', () => { const xml = invoiceUbl({ ...invoice, vatRate: 6 }, { senderId: '0208:0840931404', receiverId: null, pdfBase64: '' }); expect(xml).toContain(`<cbc:Note>${RENOVATION_VAT_NOTICE}</cbc:Note>`); expect(xml).not.toContain(REVERSE_CHARGE_VAT_NOTICE); });
});