export function manualBankMode(direction: string, total: number, paid: number, amount: number) {
  const delta = amount * (direction === 'verkoop' ? 1 : -1);
  if (delta < 0) return 'refund' as const;
  if (Math.round((paid + delta - total) * 100) > 0) return 'overpayment' as const;
  return 'payment' as const;
}

export function manualBankPreview(direction: string, total: number, paid: number, amount: number) {
  const mode = manualBankMode(direction, total, paid, amount);
  const delta = amount * (direction === 'verkoop' ? 1 : -1);
  const excess = Math.max(0, Math.round((paid - total) * 100) / 100);
  const error = amount === 0 ? 'Een nulverrichting kan niet gekoppeld worden.'
    : mode === 'refund' && excess <= 0 ? 'Geen geregistreerd teveel betaald bedrag. Koppel eerst de oorspronkelijke betaling.'
    : mode === 'refund' && Math.round((-delta - excess) * 100) > 0 ? 'De terugstorting is hoger dan het teveel betaalde bedrag.' : null;
  const next = Math.round((paid + delta) * 100) / 100;
  return { mode, error, overpaid: Math.max(0, Math.round((next - total) * 100) / 100), remaining: Math.max(0, Math.round((total - next) * 100) / 100) };
}