import type { InvoicePdfData } from "./invoice-pdf";
import { invoiceTaxGroups } from './contract-billing';
import { invoiceVatNotices } from './invoice-vat-notices';
import { invoicePaymentReference } from './invoice-payment-reference';

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const a = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Peppol BIS Billing 3.0 UBL invoice (or credit note) with the PDF embedded, so the customer gets both. Pass an empty pdfBase64 to omit the attachment (bulk accountant mail). */
export function invoiceUbl(d: InvoicePdfData, o: { senderId: string; receiverId: string | null; pdfBase64: string; creditNote?: boolean }) {
  const [sScheme, sId] = o.senderId.split(":");
  const [rScheme, rId] = o.receiverId?.split(":") ?? [];
  const c = d.customer;
  const open = Math.max(0, d.total - d.paidAmount);
  const root = o.creditNote ? "CreditNote" : "Invoice";
  const qtyTag = o.creditNote ? "CreditedQuantity" : "InvoicedQuantity";
  const lines = d.lines.map((l, i) => {
    const rate = l.vatRate ?? d.vatRate;
    const lineCat = rate === 0 ? (c.vatNumber ? 'AE' : 'Z') : 'S';
    return `
  <cac:${o.creditNote ? "CreditNoteLine" : "InvoiceLine"}>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:${qtyTag} unitCode="${l.unit === "u" ? "HUR" : l.unit === "km" ? "KMT" : "C62"}">${Math.abs(l.quantity)}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="EUR">${a(Math.abs(l.amount))}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${esc(l.description.slice(0, 200))}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${lineCat}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${Math.abs(l.unitPrice).toFixed(6)}</cbc:PriceAmount></cac:Price>
  </cac:${o.creditNote ? "CreditNoteLine" : "InvoiceLine"}>`;
  }).join("");
  const groups = invoiceTaxGroups(d.lines,d.vatRate);
  const subtotals = groups.map(g=>{
    const category = g.rate === 0 ? (c.vatNumber ? 'AE' : 'Z') : 'S';
    return `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${a(Math.abs(g.net))}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${a(Math.abs(g.vat))}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${g.rate}</cbc:Percent>${category==='AE'?'<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>':''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(d.number)}</cbc:ID>
  <cbc:IssueDate>${d.issueDate}</cbc:IssueDate>
  <cbc:DueDate>${d.dueDate}</cbc:DueDate>
  <cbc:${root}TypeCode>${o.creditNote ? "381" : "380"}</cbc:${root}TypeCode>
  ${invoiceVatNotices(d).map(notice => `<cbc:Note>${esc(notice.text)}</cbc:Note>`).join('\n  ')}
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(d.reference ?? `Werkbon ${d.workOrderNumber}`)}</cbc:BuyerReference>
  ${o.pdfBase64 ? `<cac:AdditionalDocumentReference>
    <cbc:ID>${esc(d.number)}</cbc:ID>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="Factuur-${esc(d.number)}.pdf">${o.pdfBase64}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>` : ""}
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="${sScheme}">${sId}</cbc:EndpointID>
    <cac:PostalAddress><cbc:StreetName>Natveld 47</cbc:StreetName><cbc:CityName>Bilzen</cbc:CityName><cbc:PostalZone>3740</cbc:PostalZone><cac:Country><cbc:IdentificationCode>BE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>${esc(d.company.vat.replace(/[^A-Z0-9]/gi, ""))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(d.company.name)}</cbc:RegistrationName><cbc:CompanyID schemeID="0208">${esc(d.company.vat.replace(/\D/g, "").padStart(10, "0"))}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    ${rScheme && rId ? `<cbc:EndpointID schemeID="${esc(rScheme)}">${esc(rId)}</cbc:EndpointID>` : ""}
    <cac:PostalAddress>${c.street ? `<cbc:StreetName>${esc(`${c.street} ${c.houseNumber ?? ""}`.trim())}</cbc:StreetName>` : ""}${c.city ? `<cbc:CityName>${esc(c.city)}</cbc:CityName>` : ""}${c.postalCode ? `<cbc:PostalZone>${esc(c.postalCode)}</cbc:PostalZone>` : ""}<cac:Country><cbc:IdentificationCode>BE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    ${c.vatNumber ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(c.vatNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase())}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
    <cac:PartyLegalEntity><cbc:RegistrationName>${esc(c.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  ${d.company.iban ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${esc(invoicePaymentReference(d.number))}</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>${esc(d.company.iban.replace(/\s/g, ""))}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ""}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${a(Math.abs(d.vat))}</cbc:TaxAmount>
    ${subtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${a(Math.abs(d.net))}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${a(Math.abs(d.net))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${a(Math.abs(d.total))}</cbc:TaxInclusiveAmount>
    <cbc:PrepaidAmount currencyID="EUR">${a(Math.max(0, Math.min(d.paidAmount, d.total)))}</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="EUR">${a(o.creditNote ? Math.abs(d.total) : open)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</${root}>`;
}
