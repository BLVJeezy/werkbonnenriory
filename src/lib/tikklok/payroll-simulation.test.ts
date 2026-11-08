import { describe, expect, it } from "vitest";
import { computePayroll } from "./payroll-engine";
import { monthlyOvertimeMinutes, normalizeSimulation, overtimeValue } from "./payroll-simulation";

const settings = { employee_rsz_pct: 0.1307, employer_rsz_pct: 0.2467, student_employee_pct: 0.0271, student_employer_pct: 0.0542, student_yearly_hours_limit: 650, holiday_pay_reserve_pct: 0.1538, year_end_bonus_reserve_pct: 0.0833, bv_brackets: [], dependent_reduction_per_person: 0 };
const profile = { status: "employee" as const, wage_mode: "hourly" as const, monthly_wage: null, hourly_wage: 17.17, bv_scale: "I" as const, dependents: 0, holiday_pay_enabled: false, year_end_bonus_enabled: false, fixed_bv_monthly: null };

describe("loonsecretariaatsimulatie", () => {
  it("reproduceert november: bruto, RSZ-basis, belastbaar, netto en afrekening", () => {
    const r = computePayroll({ profile, settings, workedMinutes: 158.17 * 60, workedDays: 21, advances: 1000, simulation: normalizeSimulation({ rsz_basis_factor: 1.08, employee_rsz_amount: 163.37, fixed_bv: 403.55, commute_taxable: 20.05, commute_net: 41.70, clothing_per_day: 1.7979, special_social_contribution: 18.50 }) });
    expect(r.gross).toBe(2715.78);
    expect(r.rszBasis).toBe(2933.04);
    expect(r.taxable).toBe(2572.46);
    expect(r.net).toBe(2229.87);
    expect(r.payable).toBe(1229.87);
    expect(r.commuteTotal).toBe(61.75);
    expect(r.clothingAllowance).toBe(37.76);
    expect(r.employerCost).toBe(3538.87);
  });
  it("code 8222 is alleen het totaal en wordt niet dubbel uitbetaald", () => {
    const r = computePayroll({ profile: { ...profile, hourly_wage: 0 }, settings, workedMinutes: 0, simulation: normalizeSimulation({ employee_rsz_amount: 0, fixed_bv: 0, commute_taxable: 20.05, commute_net: 41.70 }) });
    expect(r.net).toBe(61.75);
    expect(r.employerCost).toBe(61.75);
  });
  it("opgespaarde overuren worden niet automatisch betaald; waarde is 150%", () => {
    const r = computePayroll({ profile, settings, workedMinutes: 40 * 60, bankedOvertimeMinutes: 4 * 60 });
    expect(r.gross).toBe(618.12);
    expect(r.bankedOvertimeValue).toBe(103.02);
    expect(overtimeValue(4 * 60, 17.17)).toBe(103.02);
  });
  it("verdeelt een grensweek over maanden zonder dubbel tellen", () => {
    const weeks = [{ surplusMinutes: 240, days: [{ date: "2026-10-30", workedMinutes: 120 }, { date: "2026-11-01", workedMinutes: 180 }] }];
    expect(monthlyOvertimeMinutes(weeks, "2026-10")).toBe(60);
    expect(monthlyOvertimeMinutes(weeks, "2026-11")).toBe(180);
  });
});