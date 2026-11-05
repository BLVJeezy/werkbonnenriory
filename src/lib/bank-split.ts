export function bankSplitSummary(payment: number, amounts: number[]) {
  const cents = amounts.map((n) => Math.round(n * 100));
  const sum = cents.reduce((a, b) => a + b, 0);
  const difference = Math.round(Math.abs(payment) * 100) - sum;
  return { sum: sum / 100, difference: difference / 100, valid: amounts.length >= 2 && amounts.every((n) => Number.isFinite(n) && n > 0 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001) && difference === 0 };
}