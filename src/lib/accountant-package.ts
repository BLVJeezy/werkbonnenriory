// Pure helpers for the two accountant mails (UBL mail + comparison pack). Tested in accountant-package.test.ts.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const a = (n: number) => (Math.round(Math.abs(n) * 100) / 100).toFixed(2);

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
  const groups = new Map<number, { net: number; vat: number }>();
  const lines = (p.lines.length ? p.lines : [{ description: "Totaal", quantity: 1, amount: p.net, vat: p.vat }]).map((l, i) => {
    const net = Number(l.amount ?? 0);
    const rate = l.vatRate ?? (net ? Math.round((Number(l.vat ?? 0) / net) * 100) : 0);
    const g = groups.get(rate) ?? { net: 0, vat: 0 };
    g.net += net; g.vat += Number(l.vat ?? net * rate / 100); groups.set(rate, g);
    const q = Math.abs(Number(l.quantity ?? 1)) || 1;
    return `
  <cac:${root}Line><cbc:ID>${i + 1}</cbc:ID><cbc:${credit ? "CreditedQuantity" : "InvoicedQuantity"} unitCode="C62">${q}</cbc:${credit ? "CreditedQuantity" : "InvoicedQuantity"}><cbc:LineExtensionAmount currencyID="EUR">${a(net)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${esc(String(l.description ?? "Lijn").slice(0, 200))}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${rate ? "S" : "Z"}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${Math.abs(Number(l.unitPrice ?? net / q)).toFixed(6)}</cbc:PriceAmount></cac:Price>
  </cac:${root}Line>`;
  }).join("");
  const subtotals = [...groups].map(([rate, g]) => `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${a(g.net)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">${a(g.vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${rate ? "S" : "Z"}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`).join("");
  const party = (name: string, vat: string | null) => `<cac:Party>${vat ? `<cbc:EndpointID schemeID="9925">${esc(vatId(vat))}</cbc:EndpointID>` : ""}<cac:PartyName><cbc:Name>${esc(name)}</cbc:Name></cac:PartyName>${vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(vatId(vat))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}<cac:PartyLegalEntity><cbc:RegistrationName>${esc(name)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(p.invoice_number ?? "zonder-nummer")}</cbc:ID>
  <cbc:IssueDate>${p.invoice_date ?? ""}</cbc:IssueDate>${!credit && p.due_date ? `\n  <cbc:DueDate>${p.due_date}</cbc:DueDate>` : ""}
  <cbc:${root}TypeCode>${credit ? 381 : 380}</cbc:${root}TypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>${party(p.supplier_name, p.supplier_vat)}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${party(buyer.name, buyer.vat)}</cac:AccountingCustomerParty>${p.supplier_iban ? `
  <cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>${p.payment_ref ? `<cbc:PaymentID>${esc(p.payment_ref)}</cbc:PaymentID>` : ""}<cac:PayeeFinancialAccount><cbc:ID>${esc(p.supplier_iban.replace(/\s/g, ""))}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ""}
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${a(p.vat)}</cbc:TaxAmount>${subtotals}</cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${a(p.net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${a(p.net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${a(p.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${a(p.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lines}
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
