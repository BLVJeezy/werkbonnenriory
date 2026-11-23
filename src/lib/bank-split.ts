export function bankSplitSummary(payment: number, amounts: number[]) {
  const cents = amounts.map((n) => Math.round(n * 100));
  const sum = cents.reduce((a, b) => a + b, 0);
  const difference = Math.round(Math.abs(payment) * 100) - sum;
  return { sum: sum / 100, difference: difference / 100, valid: Number.isFinite(payment) && amounts.length >= 1 && amounts.every((n) => Number.isFinite(n) && n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001) && difference >= 0 };
}

/** Een aankoopfactuur of een verkoopcreditnota (terugstorting) hoort bij een uitgaande betaling (< 0). */
export function docExpectsOutgoing(doc: { doc_type?: string | null; direction: string }): boolean {
  return doc.doc_type === 'creditnota' ? doc.direction === 'verkoop' : doc.direction === 'aankoop';
}

/** Positief openstaand saldo van een factuur of creditnota. */
export function docOpenAmount(doc: { paid_amount?: number | null }, signedTotal: number): number {
  return Math.round(Math.max(0, Math.abs(signedTotal) - Number(doc.paid_amount ?? 0)) * 100) / 100;
}