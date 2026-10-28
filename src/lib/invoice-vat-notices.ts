import type { InvoiceLine } from './invoice';

/** Belgian renovation declaration (KB nr. 20, table A, rubriek XXXI).
 * The selected tax rate is an admin decision, not proof that the works qualify.
 * https://www.securex.be/nl/lex4you/zelfstandige/nieuws/btw-van-6-voor-de-renovatie-van-woningen
 */
export const RENOVATION_VAT_NOTICE = 'Btw-tarief: Bij gebrek aan schriftelijke betwisting binnen een termijn van één maand vanaf de ontvangst van de factuur, wordt de klant geacht te erkennen dat (1) de werken worden verricht aan een woning waarvan de eerste ingebruikneming heeft plaatsgevonden in een kalenderjaar dat ten minste tien jaar voorafgaat aan de datum van de eerste factuur met betrekking tot die werken, (2) de woning, na uitvoering van die werken, uitsluitend of hoofdzakelijk als privéwoning wordt gebruikt en (3) de werken worden verstrekt en gefactureerd aan een eindverbruiker. Wanneer minstens één van die voorwaarden niet is voldaan, zal het normale btw-tarief van 21 % van toepassing zijn en is de afnemer ten aanzien van die voorwaarden aansprakelijk voor de betaling van de verschuldigde belasting, interesten en geldboeten.';

/** Mandatory Belgian immovable-work reverse-charge declaration, KB nr. 1 art. 20 §3 (2023).
 * https://www.deloitte.com/be/en/services/tax/blogs/tax-legal-pulse-nl/werk-in-onroerende-staat-met-verlegging-van-heffing-belangrijke-wijzigingen-in-2023.html
 */
export const REVERSE_CHARGE_VAT_NOTICE = 'Verlegging van heffing. Bij gebrek aan schriftelijke betwisting binnen een termijn van één maand na de ontvangst van de factuur, wordt de afnemer geacht te erkennen dat hij een belastingplichtige is gehouden tot de indiening van periodieke aangiften. Als die voorwaarde niet vervuld is, is de afnemer ten aanzien van die voorwaarde aansprakelijk voor de betaling van de verschuldigde belasting, interesten en geldboeten.';

/** Preserve existing invoice tax treatment: 0% with VAT number denotes reverse charge.
 * Inspect actual line rates (not just the first line) for mixed-rate invoices.
 */
export function invoiceVatNotices(d: { lines: InvoiceLine[]; vatRate: number; customer: { vatNumber: string | null } }) {
  const rates = new Set(d.lines.length ? d.lines.map(l => l.vatRate ?? d.vatRate) : [d.vatRate]);
  const notices: { title: string; text: string }[] = [];
  if (rates.has(6)) notices.push({ title: 'Btw-tarief 6% — renovatie van privéwoningen', text: RENOVATION_VAT_NOTICE });
  if (rates.has(0) && d.customer.vatNumber?.trim()) notices.push({ title: 'Btw verlegd', text: REVERSE_CHARGE_VAT_NOTICE });
  return notices;
}