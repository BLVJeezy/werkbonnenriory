import { lastClosedMonth } from '@/lib/dashboard-period';

export function personnelChartMonths(year: number, today: string, showOpen: boolean) {
  const cutoff = showOpen ? today.slice(0, 7) : lastClosedMonth(today).to.slice(0, 7);
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter(period => period <= cutoff);
}

export function personnelChartPoint(period: string, estimate: {
  rows: { workedHours: number; warnings: string[] }[];
  estimated: number | null;
}) {
  return {
    period,
    label: new Date(`${period}-01T12:00:00Z`).toLocaleDateString('nl-BE', { month: 'short', timeZone: 'Europe/Brussels' }),
    hours: Math.round(estimate.rows.reduce((sum, row) => sum + row.workedHours, 0) * 100) / 100,
    cost: estimate.estimated,
    warnings: [...new Set(estimate.rows.flatMap(row => row.warnings))],
  };
}