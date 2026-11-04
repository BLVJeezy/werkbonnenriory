import { addDays } from './invoice';
import { invoiceUbl } from './invoice-ubl';
import type { InvoicePdfData } from './invoice-pdf';

export type TestInvoiceCompany = { name: string; vat: string; iban: string | null; bic: string | null };

/** Fixed Peppol identifiers for a Peppol BIS Billing 3.0 invoice. */
export const PEPPOL_INVOICE_PROCESS = 'cenbii-procid-ubl::urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
export const PEPPOL_INVOICE_DOCUMENT = 'busdox-docid-qns::urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1';

/**
 * Synthetic supplier invoice used only to check the Peppol receive pipeline end to end.
 * It is never booked, never mailed to a customer and clearly labelled as a test.
 */
export function peppolTestInvoiceData(company: TestInvoiceCompany, today: string): InvoicePdfData {
  const net = 341, vat = 71.61;
  return {
    number: `TEST-${today.replace(/-/g, '')}`,
    issueDate: today,
    dueDate: addDays(today, 15),
    workOrderNumber: 0,
    customer: {
      name: company.name, address: 'Natveld 47, 3740 Bilzen', siteAddress: null,
      vatNumber: company.vat, email: 'boekhouding@riory.be',
      street: 'Natveld', houseNumber: '47', postalCode: '3740', city: 'Bilzen',
    },
    lines: [
      { description: 'Testlijn 1: dieptereiniging regenput', quantity: 1, unit: 'st', unitPrice: 250, amount: 250 },
      { description: 'Testlijn 2: verbruiksmaterialen', quantity: 2, unit: 'st', unitPrice: 45.5, amount: 91 },
    ],
    vatRate: 21, net, vat, total: net + vat, paidAmount: 0,
    company, terms: null,
    title: 'TESTFACTUUR',
    reference: 'Peppol-testfactuur — geen echte betaling',
  };
}

/** UBL addressed to the same participant that sends it, so one test account closes the loop. */
export function peppolTestInvoiceUbl(data: InvoicePdfData, participantId: string, pdfBase64: string) {
  return invoiceUbl(data, { senderId: participantId, receiverId: participantId, pdfBase64 });
}
