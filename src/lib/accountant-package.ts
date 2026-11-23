// Pure helpers for the two accountant mails (UBL mail + comparison pack). Tested in accountant-package.test.ts.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const round2 = (n: number) => Math.round(n * 100) / 100;
const a = (n: number) => round2(Math.abs(n)).toFixed(2);
const signed = (n: number) => round2(n).toFixed(2);

const PEPPOL_VAT_SCHEME: Record<string, string> = {
  BE: "9925", NL: "9944", FR: "9957", DE: "9930", IE: "9928", LU: "9938",
};

function vatCountry(vat: string | null | undefined): string {
  const clean = (vat ?? "").replace(/[\s.]/g, "").toUpperCase();
  const cc = clean.slice(0, 2);
  return /^[A-Z]{2}$/.test(cc) ? cc : "BE";
}

function peppolEndpoint(vat: string | null | undefined): { scheme: string; id: string } | null {
  const clean = (vat ?? "").replace(/[\s.]/g, "").toUpperCase();
  const cc = clean.slice(0, 2);
  const scheme = PEPPOL_VAT_SCHEME[cc];
  if (!scheme || clean.length < 4) return null;
  return { scheme, id: clean };
}

/** Download filename for one UBL: the accountant's package only reads .xml, never .ubl. */
export function ublFilename(prefix: string, label: string, ref: string) {
  const safe = `${prefix}-${label}-${ref}`.replace(/[^\w.-]+/g, "_").slice(0, 90);
  return `${safe}.xml`;
}

/** Embed the actual private source file; never send extracted data without it. */
export function withSourceDocument(xml: string, source: { name: string; mime: string; base64: string }) {
  if (!source.base64) throw new Error(`Origineel document ontbreekt: ${source.name}`);
  if (/<(?:[\w.-]+:)?EmbeddedDocumentBinaryObject\b(?=[^>]*mimeCode=["']application\/pdf["'])[^>]*>\s*[^<\s]/.test(xml)) return xml;
  const namespaces = [...xml.matchAll(/xmlns:([\w.-]+)=["']([^"']+)["']/g)];
  const prefix = (type: string, fallback: string) => namespaces.find(m => m[2]?.includes(type))?.[1] ?? fallback;
  const aggregate = prefix('CommonAggregateComponents-2', 'cac');
  const basic = prefix('CommonBasicComponents-2', 'cbc');
  const attachment = `<${aggregate}:AdditionalDocumentReference><${basic}:ID>${esc(source.name)}</${basic}:ID><${aggregate}:Attachment><${basic}:EmbeddedDocumentBinaryObject mimeCode="${esc(source.mime)}" filename="${esc(source.name)}">${source.base64}</${basic}:EmbeddedDocumentBinaryObject></${aggregate}:Attachment></${aggregate}:AdditionalDocumentReference>`;
  const supplier = /<(?:[\w.-]+:)?AccountingSupplierParty\b/;
  if (!supplier.test(xml)) throw new Error('Originele UBL bevat geen leverancier');
  return xml.replace(supplier, match => `${attachment}\n${match}`);
}

/** Graph's direct attachment request is limited; include JSON overhead and never silently drop a file. */
export function attachmentBatches<T>(items: T[], maxBytes = 2_500_000): T[][] {
  const batches: T[][] = []; let batch: T[] = []; let size = 0;
  for (const item of items) {
    const bytes = new TextEncoder().encode(JSON.stringify(item)).length + 1;
    if (bytes > 120_000_000) throw new Error('Een factuurbijlage is te groot voor e-mail. Er is niets verstuurd.');
    if (bytes > maxBytes) { if (batch.length) batches.push(batch); batches.push([item]); batch = []; size = 0; continue; }
    if (size + bytes > maxBytes) { batches.push(batch); batch = []; size = 0; }
    batch.push(item); size += bytes;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export type PurchaseForUbl = {
  supplier_name: string; supplier_vat: string | null; supplier_iban: string | null; invoice_number: string | null;
  invoice_date: string | null; due_date: string | null; kind: string; net: number; vat: number; total: number; payment_ref?: string | null;
  lines: { description?: string; quantity?: number; unitPrice?: number; amount?: number; vatRate?: number | null; vat?: number | null }[];
};

/** UBL (Peppol BIS 3 structure) for a received purchase invoice/credit note, Riory as buyer, so the accountant gets every purchase in one format. */
export function purchaseUbl(p: PurchaseForUbl, buyer: { name: string; vat: string }) {
  const credit = p.kind === "creditnota";
  const root = credit ? "CreditNote" : "Invoice";
  const vatId = (v: string | null) => (v ?? "").replace(/[\s.]/g, "").toUpperCase();
  const supplierCountry = vatCountry(p.supplier_vat);
  const buyerCountry = vatCountry(buyer.vat);
  const headerNet = round2(Math.abs(Number(p.net ?? 0)));
  const headerVat = round2(Math.abs(Number(p.vat ?? 0)));
  const headerTotal = round2(headerNet + headerVat);
  const sign = credit ? -1 : 1;

  const rawLines = p.lines.map(l => {
    const net = round2(Number(l.amount ?? 0) * sign);
    const rate = l.vatRate != null ? Number(l.vatRate) : (net ? Math.round((Math.abs(Number(l.vat ?? 0)) / Math.abs(net)) * 100) : 0);
    const vat = l.vat != null ? round2(Number(l.vat) * sign) : round2(net * rate / 100);
    const q = Math.abs(Number(l.quantity ?? 1)) || 1;
    const unitPrice = l.unitPrice != null ? Math.abs(Number(l.unitPrice)) : Math.abs(net / q);
    return { description: String(l.description ?? "Lijn").slice(0, 200) || "Lijn", quantity: q, unitPrice, net, vat, rate };
  });

  const linesNetSum = round2(rawLines.reduce((s, l) => s + l.net, 0));
  const linesVatSum = round2(rawLines.reduce((s, l) => s + l.vat, 0));
  const linesMatch = rawLines.length > 0 && Math.abs(linesNetSum - headerNet) <= 0.01 && Math.abs(linesVatSum - headerVat) <= 0.01 && rawLines.every(l => l.net >= 0);
  const effectiveRate = headerNet > 0 ? Math.round((headerVat / headerNet) * 100) : 0;
  const effectiveLines = linesMatch
    ? rawLines
    : [{ description: p.invoice_number ? `Factuur ${p.invoice_number}` : "Totaal", quantity: 1, unitPrice: headerNet, net: headerNet, vat: headerVat, rate: effectiveRate }];

  const groups = new Map<number, { net: number; vat: number }>();
  const taxCat = (rate: number) => (rate > 0 ? "S" : supplierCountry !== buyerCountry ? "AE" : "Z");
  const lines = effectiveLines.map((l, i) => {
    const g = groups.get(l.rate) ?? { net: 0, vat: 0 };
    g.net = round2(g.net + l.net);
    g.vat = round2(g.vat + l.vat);
    groups.set(l.rate, g);
    return `
  <cac:${root}Line><cbc:ID>${i + 1}</cbc:ID><cbc:${credit ? "CreditedQuantity" : "InvoicedQuantity"} unitCode="C62">${l.quantity}</cbc:${credit ? "CreditedQuantity" : "InvoicedQuantity"}><cbc:LineExtensionAmount currencyID="EUR">${signed(l.net)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${esc(l.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat(l.rate)}</cbc:ID><cbc:Percent>${l.rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${l.unitPrice.toFixed(6)}</cbc:PriceAmount></cac:Price>
  </cac:${root}Line>`;
  }).join("");

  const subtotals = [...groups].map(([rate, g]) => {
    const cat = taxCat(rate);
    const reason = cat === "AE" ? "<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>" : "";
    return `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${signed(g.net)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${signed(g.vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${cat}</cbc:ID><cbc:Percent>${rate}</cbc:Percent>${reason}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`;
  }).join("");

  const totalNet = round2([...groups.values()].reduce((s, g) => s + g.net, 0));
  const totalVat = round2([...groups.values()].reduce((s, g) => s + g.vat, 0));
  const totalGross = round2(totalNet + totalVat);
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(p.invoice_date ?? "") ? p.invoice_date! : new Date().toISOString().slice(0, 10);
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(p.due_date ?? "") ? p.due_date! : null;

  const party = (name: string, vat: string | null, address: { street?: string; city?: string; postal?: string; country: string }) => {
    const ep = peppolEndpoint(vat);
    const addr = `<cac:PostalAddress>${address.street ? `<cbc:StreetName>${esc(address.street)}</cbc:StreetName>` : ""}${address.city ? `<cbc:CityName>${esc(address.city)}</cbc:CityName>` : ""}${address.postal ? `<cbc:PostalZone>${esc(address.postal)}</cbc:PostalZone>` : ""}<cac:Country><cbc:IdentificationCode>${esc(address.country)}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>`;
    return `<cac:Party>${ep ? `<cbc:EndpointID schemeID="${ep.scheme}">${esc(ep.id)}</cbc:EndpointID>` : ""}<cac:PartyName><cbc:Name>${esc(name)}</cbc:Name></cac:PartyName>${addr}${vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vatId(vat))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}<cac:PartyLegalEntity><cbc:RegistrationName>${esc(name)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(p.invoice_number ?? "zonder-nummer")}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>${!credit && dueDate ? `\n  <cbc:DueDate>${dueDate}</cbc:DueDate>` : ""}
  <cbc:${root}TypeCode>${credit ? 381 : 380}</cbc:${root}TypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(p.invoice_number ?? "NVT")}</cbc:BuyerReference>
  <cac:AccountingSupplierParty>${party(p.supplier_name, p.supplier_vat, { country: supplierCountry })}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${party(buyer.name, buyer.vat, { street: "Natveld 47", city: "Bilzen", postal: "3740", country: buyerCountry })}</cac:AccountingCustomerParty>${p.supplier_iban ? `
  <cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>${p.payment_ref ? `<cbc:PaymentID>${esc(p.payment_ref)}</cbc:PaymentID>` : ""}<cac:PayeeFinancialAccount><cbc:ID>${esc(p.supplier_iban.replace(/\s/g, ""))}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ""}
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${a(totalVat)}</cbc:TaxAmount>${subtotals}</cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${a(totalNet)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${a(totalNet)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${a(totalGross)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${a(totalGross)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lines}
</${root}>`;
}

export type CompletenessInput = {
  purchasesToCheck: number;
  salesUnsent: number;
  financeToReview: number;
  financeUnbooked: number;
  bankUnbooked: number;
  monthsIncomplete: string[];
  investmentsIncomplete: string[];
  journalLines: number;
  trialDiff: number;
};

/** Pure: everything that makes the accounting incomplete for the chosen year. Empty list = complete. */
export function accountantWarnings(x: CompletenessInput): string[] {
  const w: string[] = [];
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (x.purchasesToCheck) w.push(`${n(x.purchasesToCheck, "aankoopfactuur moet", "aankoopfacturen moeten")} nog gecontroleerd worden.`);
  if (x.salesUnsent) w.push(`${n(x.salesUnsent, "verkoopfactuur is", "verkoopfacturen zijn")} nog niet verzonden.`);
  if (x.financeToReview) w.push(`${n(x.financeToReview, "factuur staat", "facturen staan")} in Finance nog ter beoordeling.`);
  if (x.financeUnbooked) w.push(`${n(x.financeUnbooked, "goedgekeurde factuur is", "goedgekeurde facturen zijn")} nog niet geboekt in het dagboek.`);
  if (x.bankUnbooked) w.push(`${n(x.bankUnbooked, "banktransactie is", "banktransacties zijn")} nog niet geboekt of afgeletterd.`);
  if (x.monthsIncomplete.length) w.push(`Maanden niet als volledig afgevinkt: ${x.monthsIncomplete.join(", ")}.`);
  if (x.investmentsIncomplete.length) w.push(`Afschrijvingsgegevens ontbreken voor: ${x.investmentsIncomplete.join(", ")}.`);
  if (!x.journalLines) w.push("Er zijn nog geen boekingen in deze periode — balans en resultaat zijn leeg.");
  else if (Math.round(x.trialDiff * 100) !== 0) w.push(`De proefbalans sluit niet (verschil € ${x.trialDiff.toFixed(2)}).`);
  return w;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pure: turns whatever the UI sent into a usable ISO period, or explains what is wrong. */
export function normalizePeriod(i: { from?: string | null; to?: string | null }): { from: string; to: string } {
  const from = String(i?.from ?? "").trim();
  const to = String(i?.to ?? "").trim();
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new Error("Kies een geldige begin- en einddatum (jjjj-mm-dd).");
  const y = Number(from.slice(0, 4));
  if (y < 2000 || y > 2100) throw new Error("Het boekjaar moet tussen 2000 en 2100 liggen.");
  if (from > to) throw new Error("De begindatum moet voor de einddatum liggen.");
  return { from, to };
}

/** "01/01/2026 tot 31/12/2026" — same wording in mails, screen and file names. */
export function periodLabel(from: string, to: string) {
  const d = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return `${d(from)} tot ${d(to)}`;
}

/** File-name safe version of the period, e.g. 2026-01-01_tot_2026-12-31. */
export const periodSlug = (from: string, to: string) => `${from}_tot_${to}`;

/** Months (YYYY-MM) inside the period that have already ended by `today`. */
export function monthsInPeriod(from: string, to: string, today: string): string[] {
  const out: string[] = [];
  const first = from.slice(0, 7);
  const last = to.slice(0, 7);
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  while (true) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > last) break;
    if (key < today.slice(0, 7)) out.push(key);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}
