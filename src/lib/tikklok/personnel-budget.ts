import { computePayroll, type PayrollComputationInput } from './payroll-engine';

const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export type HoursRegime = { effective_from: string; weekly_hours: number | null; daily_schedule: unknown };

/** Calendar-day contract calculation; hours history overrides the current regime. */
export function contractMonth(period: string, weeklyHours: number | null, schedule: unknown, start: string | null, history: HoursRegime[] = []) {
  const [year, month] = period.split('-').map(Number);
  const count = new Date(Date.UTC(year ?? 0, month ?? 0, 0)).getUTCDate();
  let minutes = 0, workdays = 0, employedDays = 0;
  let complete = true;
  for (let day = 1; day <= count; day++) {
    const date = `${period}-${String(day).padStart(2, '0')}`;
    if (start && date < start) continue;
    employedDays++;
    const regime = history.filter(h => h.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
    const raw = regime ? regime.daily_schedule : schedule;
    const hours = regime ? regime.weekly_hours : weeklyHours;
    const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    const valid = object && days.every(key => object[key] != null && Number.isFinite(Number(object[key])) && Number(object[key]) >= 0);
    const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day)).getUTCDay();
    if (!valid && hours == null) complete = false;
    const value = valid ? Number(object[days[weekday] ?? 'sun']) : weekday > 0 && weekday < 6 ? (hours ?? 0) / 5 : 0;
    minutes += Math.round(value * 60);
    if (value > 0) workdays++;
  }
  return { minutes, workdays, employedFraction: employedDays / count, complete };
}

export function personnelCost(input: PayrollComputationInput, employedFraction = 1): number | null {
  if (input.profile.status === 'temp') return null; // agency invoice is not an employee wage
  const monthly = input.profile.wage_mode === 'monthly' || input.profile.status === 'director';
  const wage = monthly ? input.profile.monthly_wage : input.profile.hourly_wage;
  if (wage == null || !Number.isFinite(wage) || wage < 0) return null;
  if (employedFraction === 0) return 0;
  return computePayroll({ ...input, profile: { ...input.profile, monthly_wage: monthly ? (input.profile.monthly_wage ?? 0) * employedFraction : input.profile.monthly_wage } }).employerCost;
}

export function completePersonnelTotal(values: (number | null)[]): number | null {
  return values.length && values.every(v => v != null) ? Math.round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100 : null;
}