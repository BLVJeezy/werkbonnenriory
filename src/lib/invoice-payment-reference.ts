/** Belgian OGM: ten base digits and a modulo-97 check (zero becomes 97). */
export function structuredReference(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (!digits || digits.length > 10) throw new Error('Factuurnummer moet 1 tot 10 cijfers bevatten.');
  const base = digits.padStart(10, '0');
  const check = String(Number(base) % 97 || 97).padStart(2, '0');
  return `+++${base.slice(0, 3)}/${base.slice(3, 7)}/${base.slice(7)}${check}+++`;
}

/** Preserve legacy non-numeric document identifiers rather than inventing a bank reference. */
export function invoicePaymentReference(number: string): string {
  return /\d/.test(number) ? structuredReference(number) : number;
}