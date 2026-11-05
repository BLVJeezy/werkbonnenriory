export const PAYMENT_METHODS = { overschrijving: 'Overschrijving', domiciliering: 'Domiciliëring', kaart: 'Kaart', cash: 'Cash' };
/** Bank details are needed only for a payment that still requires a manual transfer. */
export function needsPurchaseBankDetails(method = 'overschrijving', status = 'te_controleren') {
  return status !== 'betaald' && !['kaart', 'domiciliering', 'cash'].includes(method);
}
export const VAT_RULES = { document: 'Btw volgens document', '0': '0%', '6': '6%', '12': '12%', '21': '21%', verlegd: 'Btw verlegd', vrijgesteld: 'Vrijgesteld' };
export function deductibleVat(vat: number, percent: number) {
  return Math.round(vat * Math.max(0, Math.min(100, percent))) / 100;
}
export function supplierVatWarning(net: number, vat: number, rule: string) {
  if (rule === 'document') return null;
  const expected = Math.round(net * (['verlegd', 'vrijgesteld'].includes(rule) ? 0 : Number(rule))) / 100;
  return Math.abs(vat - expected) > 0.02 ? 'Btw op het document wijkt af van de leveranciersregel.' : null;
}