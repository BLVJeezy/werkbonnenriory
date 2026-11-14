import { describe, expect, it } from 'vitest';
import { contractMonth, personnelCost, completePersonnelTotal } from './personnel-budget';

const settings = { employee_rsz_pct: .1307, employer_rsz_pct: .25, student_employee_pct: .0271, student_employer_pct: .0542, student_yearly_hours_limit: 650, holiday_pay_reserve_pct: .08, year_end_bonus_reserve_pct: .0833, bv_brackets: [], dependent_reduction_per_person: 0 };
const profile = { status: 'employee' as const, wage_mode: 'hourly' as const, monthly_wage: null, hourly_wage: 20, bv_scale: 'I' as const, dependents: 0, holiday_pay_enabled: true, year_end_bonus_enabled: true, fixed_bv_monthly: null };
describe('personeelsbudget uit tikklok', () => {
  it('berekent contracturen per kalendermaand', () => expect(contractMonth('2026-11', 40, null, null).minutes).toBe(168 * 60));
  it('gebruikt alleen dagen vanaf indiensttreding', () => expect(contractMonth('2026-11', 40, null, '2026-11-16').minutes).toBe(88 * 60));
  it('respecteert historische contracturen', () => expect(contractMonth('2026-11', 40, null, null, [{ effective_from: '2026-01-01', weekly_hours: 20, daily_schedule: null }]).minutes).toBe(84 * 60));
  it('gebruikt geklokte uren inclusief werkgeversbijdragen en reserves', () => expect(personnelCost({ profile, settings, workedMinutes: 60 * 100 })).toBe(2826.60));
  it('berekent het budget met contracturen onafhankelijk van klokuren', () => expect(personnelCost({ profile, settings, workedMinutes: contractMonth('2026-11', 40, null, null).minutes })).toBe(4748.69));
  it('telt ontbrekende lonen niet als nul', () => expect(personnelCost({ profile: { ...profile, hourly_wage: null }, settings, workedMinutes: 60 })).toBeNull());
  it('presenteert een onvolledig budget nooit als volledig totaal', () => expect(completePersonnelTotal([100, null])).toBeNull());
  it('telt uitzendkrachten niet als gratis personeelskost', () => expect(personnelCost({ profile: { ...profile, status: 'temp' }, settings, workedMinutes: 60 })).toBeNull());
  it('houdt een vast maandloon los van klokuren', () => expect(personnelCost({ profile: { ...profile, wage_mode: 'monthly', monthly_wage: 2000 }, settings, workedMinutes: 60 })).toBe(2826.60));
});