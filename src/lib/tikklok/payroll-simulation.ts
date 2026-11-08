import { z } from "zod";

const amount = z.number().min(0).max(1000000);
const override = amount.nullable().default(null);
export const simulationSchema = z.object({
  rsz_basis_factor: z.number().min(1).max(2).default(1),
  employee_rsz_pct: z.number().min(0).max(1).nullable().default(null),
  employer_rsz_pct: z.number().min(0).max(1).nullable().default(null),
  employee_rsz_amount: override,
  employer_rsz_amount: override,
  work_bonus: amount.default(0),
  fixed_bv: override,
  commute_taxable: amount.default(0),
  commute_net: amount.default(0),
  clothing_per_day: amount.default(0),
  special_social_contribution: amount.default(0),
  holiday_deduction: amount.default(0),
  other_taxable: amount.default(0),
  other_net: amount.default(0),
  other_deductions: amount.default(0),
  employer_other_costs: amount.default(0),
});
export type SimulationParameters = z.infer<typeof simulationSchema>;
export const normalizeSimulation = (value: unknown): SimulationParameters => simulationSchema.parse(value ?? {});
export const OVERTIME_MULTIPLIER = 1.5;
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const overtimeValue = (minutes: number, hourlyRate: number) => money(Math.max(0, minutes) / 60 * hourlyRate * OVERTIME_MULTIPLIER);

export const simulationFields: { key: keyof SimulationParameters; label: string; pct?: boolean }[] = [
  { key: "rsz_basis_factor", label: "Factor RSZ-basis (bv. 1,08 voor arbeider)" },
  { key: "employee_rsz_pct", label: "RSZ werknemer (%)", pct: true },
  { key: "employer_rsz_pct", label: "RSZ werkgever (%)", pct: true },
  { key: "employee_rsz_amount", label: "RSZ werknemer: vast bedrag (€)" },
  { key: "employer_rsz_amount", label: "RSZ werkgever: vast bedrag (€)" },
  { key: "work_bonus", label: "Werkbonus / RSZ-vermindering (€)" },
  { key: "fixed_bv", label: "Bedrijfsvoorheffing: vast bedrag (€)" },
  { key: "commute_taxable", label: "4200 · Verplaatsing belastbaar / maand (€)" },
  { key: "commute_net", label: "5100 · Verplaatsing netto / maand (€)" },
  { key: "clothing_per_day", label: "5026 · Onderhoud kledij / werkdag (€)" },
  { key: "special_social_contribution", label: "6810 · Bijzondere bijdrage sociale zekerheid (€)" },
  { key: "holiday_deduction", label: "Inhouding vakantiegeld (€)" },
  { key: "other_taxable", label: "Andere belastbare vergoedingen (€)" },
  { key: "other_net", label: "Andere nettovergoedingen (€)" },
  { key: "other_deductions", label: "Andere netto-inhoudingen (€)" },
  { key: "employer_other_costs", label: "Andere werkgeverskosten / maand (€)" },
];

// A weekly surplus is allocated to the last worked minutes of that week.
// This keeps weeks crossing a month boundary from being counted twice.
export function monthlyOvertimeMinutes(weeks: { surplusMinutes: number; days: { date: string; workedMinutes: number }[] }[], period: string) {
  let total = 0;
  for (const week of weeks) {
    let remaining = week.surplusMinutes;
    for (const day of [...week.days].sort((a, b) => b.date.localeCompare(a.date))) {
      const allocated = Math.min(remaining, day.workedMinutes);
      if (day.date.startsWith(`${period}-`)) total += allocated;
      remaining -= allocated;
    }
  }
  return total;
}