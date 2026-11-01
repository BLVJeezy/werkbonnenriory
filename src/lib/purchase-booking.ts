import { normalizePurchaseInvoice, type ParsedPurchaseInvoice, type PurchaseLine } from './purchase-invoice';

/** Pure: stable key for learning a booking from a line description (numbers/dates stripped). */
export function lineKey(description: string): string {
  return description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\d+([.,/-]\d+)*/g, ' ').replace(/[^a-z]+/g, ' ').trim().split(' ').filter(w => w.length > 2).slice(0, 6).join(' ');
}

export type BookingRule = { supplier_id: string | null; match_key: string; account: string; uses: number };

/** Pure: learned account for a line — same supplier + same text first, then the supplier's usual account. */
export function learnedAccount(line: PurchaseLine, supplierId: string | null, rules: BookingRule[]): string | null {
  const k = lineKey(line.description);
  const exact = rules.find(r => r.supplier_id === supplierId && r.match_key === k);
  if (exact) return exact.account;
  const supplierRules = rules.filter(r => supplierId && r.supplier_id === supplierId).sort((a, b) => b.uses - a.uses);
  return supplierRules[0]?.account ?? null;
}

/** Pure: whole days until due (negative = overdue), using calendar dates. */
export function daysUntilDue(due: string | null, today: string): number | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

export function dueLabel(days: number | null): { text: string; overdue: boolean; soon: boolean } {
  if (days === null) return { text: 'Geen vervaldag', overdue: false, soon: false };
  if (days < 0) return { text: `VERVALLEN sinds ${-days} dag${days === -1 ? '' : 'en'}`, overdue: true, soon: false };
  if (days === 0) return { text: 'Vervalt vandaag', overdue: false, soon: true };
  return { text: `Nog ${days} dag${days === 1 ? '' : 'en'}`, overdue: false, soon: days <= 7 };
}

/** Pure: payment communication — structured reference if present, otherwise the invoice number. */
export function paymentCommunication(paymentRef: string | null, invoiceNumber: string | null): string | null {
  return paymentRef?.trim() || (invoiceNumber?.trim() ? `Factuur ${invoiceNumber.trim()}` : null);
}

/** Pure: every supplier needs IBAN and BIC for SEPA payments. */
export function supplierBankWarnings(s: { iban: string | null; bic: string | null } | null | undefined): string[] {
  if (!s) return ['Kies een leverancier'];
  const w: string[] = [];
  if (!s.iban?.trim()) w.push('IBAN ontbreekt bij deze leverancier');
  if (!s.bic?.trim()) w.push('BIC ontbreekt bij deze leverancier');
  return w;
}

/** Pure: domiciliation/card/cash invoices must never be paid manually via a SEPA file. */
export function paymentMethodLock(method: string, status: string): string | null {
  if (status === 'betaald') return null;
  if (method === 'domiciliering') return 'Domiciliëring — niet manueel betalen';
  if (method === 'kaart') return 'Kaartbetaling — niet manueel betalen';
  if (method === 'cash') return 'Cash — niet manueel betalen';
  return null;
}

const tag = (xml: string, name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i').exec(xml)?.[1]?.trim() ?? null;
const tags = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'gi'))].map(m => m[1] ?? '');
const decode = (s: string | null) => s?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() || null;

/** Pure: reads an incoming Peppol BIS 3 UBL invoice/credit note. */
export function parsePurchaseUbl(xml: string): ParsedPurchaseInvoice & { kind: 'factuur' | 'creditnota'; pdfBase64: string | null } {
  const kind = /<(?:[\w-]+:)?CreditNote[\s>]/.test(xml) ? 'creditnota' : 'factuur';
  const party = tag(xml, 'AccountingSupplierParty') ?? '';
  const legal = tag(party, 'PartyLegalEntity') ?? '';
  const name = decode(tag(legal, 'RegistrationName')) ?? decode(tag(tag(party, 'PartyName') ?? '', 'Name'));
  const vat = decode(tag(tag(party, 'PartyTaxScheme') ?? '', 'CompanyID'));
  const pm = tag(xml, 'PaymentMeans') ?? '';
  const fin = tag(pm, 'PayeeFinancialAccount') ?? '';
  const lineTag = kind === 'creditnota' ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = kind === 'creditnota' ? 'CreditedQuantity' : 'InvoicedQuantity';
  const totals = tag(xml, 'LegalMonetaryTotal') ?? '';
  const lines = tags(xml, lineTag).map(l => ({
    description: decode(tag(tag(l, 'Item') ?? '', 'Name')) ?? decode(tag(l, 'Description')) ?? 'Lijn',
    quantity: Number(tag(l, qtyTag)) || 1,
    unit: /unitCode="([^"]+)"/.exec(l)?.[1] ?? 'st',
    unitPrice: Number(tag(tag(l, 'Price') ?? '', 'PriceAmount')) || 0,
    amount: Number(tag(l, 'LineExtensionAmount')) || 0,
  }));
  const taxTotal = tag(xml, 'TaxTotal') ?? '';
  const ref = decode(tag(pm, 'PaymentID'));
  const number = decode(tag(xml.replace(/<(?:[\w-]+:)?(AccountingSupplierParty|AccountingCustomerParty|InvoiceLine|CreditNoteLine|BillingReference|OrderReference)[\s\S]*?<\/(?:[\w-]+:)?\1>/g, ''), 'ID'));
  const parsed = normalizePurchaseInvoice({
    supplierName: name, supplierVat: vat, supplierIban: decode(tag(fin, 'ID'))?.replace(/\s/g, ''),
    invoiceNumber: number, invoiceDate: decode(tag(xml, 'IssueDate')),
    dueDate: decode(tag(xml, 'DueDate')) ?? decode(tag(pm, 'PaymentDueDate')),
    lines, net: Number(tag(totals, 'TaxExclusiveAmount')) || undefined, vat: Number(tag(taxTotal, 'TaxAmount')) || 0,
    total: Number(tag(totals, 'PayableAmount')) || Number(tag(totals, 'TaxInclusiveAmount')) || undefined,
    paymentRef: ref,
  });
  const bic = decode(tag(tag(fin, 'FinancialInstitutionBranch') ?? '', 'ID'));
  const pdfMatch = /<(?:[\w-]+:)?EmbeddedDocumentBinaryObject[^>]*mimeCode="application\/pdf"[^>]*>([\s\S]*?)<\//i.exec(xml);
  return { ...parsed, kind, pdfBase64: pdfMatch?.[1]?.replace(/\s/g, '') || null, ...(bic ? { supplierBic: bic } : {}) } as ParsedPurchaseInvoice & { kind: 'factuur' | 'creditnota'; pdfBase64: string | null };
}
