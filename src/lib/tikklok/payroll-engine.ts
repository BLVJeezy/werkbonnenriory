// Pure server-only payroll calculation helpers.
// Berekening op basis van instelbare parameters uit payroll_settings.
// Deze module doet GEEN database calls — enkel wiskunde.
import { money, normalizeSimulation, overtimeValue, type SimulationParameters } from "./payroll-simulation";

export type PayrollStatus = "employee" | "temp" | "student" | "director";

export type BvBracket = { upTo: number | null; rate: number };

export type PayrollSettings = {
  employee_rsz_pct: number;
  employer_rsz_pct: number;
  student_employee_pct: number;
  student_employer_pct: number;
  student_yearly_hours_limit: number;
  holiday_pay_reserve_pct: number;
  year_end_bonus_reserve_pct: number;
  bv_brackets: BvBracket[];
  dependent_reduction_per_person: number;
};

export type PayrollProfileInput = {
  status: PayrollStatus;
  wage_mode: "monthly" | "hourly";
  monthly_wage: number | null;
  hourly_wage: number | null;
  bv_scale: "I" | "II" | "III";
  dependents: number;
  holiday_pay_enabled: boolean;
  year_end_bonus_enabled: boolean;
  fixed_bv_monthly: number | null;
};

export type PayrollComputationInput = {
  profile: PayrollProfileInput;
  settings: PayrollSettings;
  workedMinutes: number;
  workedDays?: number;
  bankedOvertimeMinutes?: number;
  advances?: number;
  simulation?: SimulationParameters;
  studentYearHoursSoFar?: number; // hours worked in same calendar year (student quota)
};

export type PayrollComputationResult = {
  gross: number;
  rszEmployee: number;
  rszEmployer: number;
  taxable: number;
  bv: number;
  net: number;
  holidayPayReserve: number;
  yearEndBonusReserve: number;
  employerCost: number;
  warnings: string[];
  rszBasis: number;
  commuteTotal: number;
  clothingAllowance: number;
  taxableAllowances: number;
  netAllowances: number;
  deductions: number;
  advances: number;
  payable: number;
  regularMinutes: number;
  bankedOvertimeValue: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeBv(taxable: number, brackets: BvBracket[], scale: "I" | "II" | "III", dependents: number, reductionPerPerson: number) {
  if (taxable <= 0) return 0;
  let bv = 0;
  let previous = 0;
  for (const bracket of brackets) {
    const cap = bracket.upTo == null ? Infinity : bracket.upTo;
    const slice = Math.max(0, Math.min(taxable, cap) - previous);
    bv += slice * bracket.rate;
    previous = cap;
    if (taxable <= cap) break;
  }
  // Scale II (2-inkomens gezin) & III (alleenstaande met last) — kleine correcties
  if (scale === "II") bv *= 0.95;
  if (scale === "III") bv *= 0.90;
  // Reductie voor personen ten laste
  bv = Math.max(0, bv - dependents * reductionPerPerson);
  return bv;
}

export function computePayroll(input: PayrollComputationInput): PayrollComputationResult {
  const { profile, settings, workedMinutes } = input;
  const warnings: string[] = [];
  const sim = normalizeSimulation(input.simulation);
  const regularMinutes = Math.max(0, workedMinutes - (input.bankedOvertimeMinutes ?? 0));
  const hourlyRate = profile.hourly_wage ?? 0;
  const bankedOvertimeValue = overtimeValue(input.bankedOvertimeMinutes ?? 0, hourlyRate);
  const clothingAllowance = money((input.workedDays ?? 0) * sim.clothing_per_day);
  const taxableAllowances = money(sim.commute_taxable + sim.other_taxable);
  const netAllowances = money(sim.commute_net + clothingAllowance + sim.other_net);
  const deductions = money(sim.special_social_contribution + sim.holiday_deduction + sim.other_deductions);
  const advances = money(input.advances ?? 0);
  const details = { rszBasis: 0, commuteTotal: money(sim.commute_taxable + sim.commute_net), clothingAllowance, taxableAllowances, netAllowances, deductions, advances, payable: 0, regularMinutes, bankedOvertimeValue };

  // 1. Bruto
  let gross = 0;
  if (profile.status === "director") {
    gross = profile.monthly_wage ?? 0;
  } else if (profile.wage_mode === "monthly") {
    gross = profile.monthly_wage ?? 0;
  } else {
    gross = (regularMinutes / 60) * hourlyRate;
  }
  gross = round2(gross);

  // 2. RSZ + fiscale behandeling per statuut
  let rszEmployeePct = settings.employee_rsz_pct;
  let rszEmployerPct = settings.employer_rsz_pct;
  let skipBv = false;
  let studentOverQuota = false;

  if (profile.status === "student") {
    const hoursThisPeriod = workedMinutes / 60;
    const cumulative = (input.studentYearHoursSoFar ?? 0) + hoursThisPeriod;
    if (cumulative > settings.student_yearly_hours_limit) {
      studentOverQuota = true;
      warnings.push(
        `Jobstudent overschrijdt ${settings.student_yearly_hours_limit} u/jaar (${cumulative.toFixed(1)} u) — volledige RSZ van toepassing`,
      );
    } else {
      rszEmployeePct = settings.student_employee_pct;
      rszEmployerPct = settings.student_employer_pct;
      skipBv = true; // solidariteitsbijdrage → geen BV
    }
  }

  if (profile.status === "temp") {
    warnings.push("Uitzendkracht: loon wordt betaald door het uitzendkantoor. Enkel gewerkte uren worden hier bijgehouden voor doorgave.");
    return {
      ...details,
      gross,
      rszEmployee: 0,
      rszEmployer: 0,
      taxable: 0,
      bv: 0,
      net: 0,
      holidayPayReserve: 0,
      yearEndBonusReserve: 0,
      employerCost: 0,
      warnings,
    };
  }

  if (profile.status === "director") {
    // Bedrijfsleider: geen RSZ werknemer, vaste maandelijkse BV (indien opgegeven)
    const bv = sim.fixed_bv ?? profile.fixed_bv_monthly ?? 0;
    const net = round2(gross + taxableAllowances + netAllowances - bv - deductions);
    return {
      ...details,
      payable: money(net - advances),
      gross,
      rszEmployee: 0,
      rszEmployer: 0,
      taxable: money(gross + taxableAllowances),
      bv: round2(bv),
      net,
      holidayPayReserve: 0,
      yearEndBonusReserve: 0,
      employerCost: money(gross + taxableAllowances + netAllowances + sim.employer_other_costs),
      warnings,
    };
  }

  const rszBasis = money(gross * sim.rsz_basis_factor);
  const rszEmployee = sim.employee_rsz_amount ?? money(Math.max(0, rszBasis * (sim.employee_rsz_pct ?? rszEmployeePct) - sim.work_bonus));
  const rszEmployer = sim.employer_rsz_amount ?? money(rszBasis * (sim.employer_rsz_pct ?? rszEmployerPct));
  const taxable = round2(gross - rszEmployee + taxableAllowances);

  let bv = 0;
  if (!skipBv) {
    bv = round2(
      computeBv(taxable, settings.bv_brackets, profile.bv_scale, profile.dependents, settings.dependent_reduction_per_person),
    );
  }
  if (sim.fixed_bv != null) bv = sim.fixed_bv;
  const net = round2(taxable - bv + netAllowances - deductions);
  if (sim.employee_rsz_amount != null || sim.employer_rsz_amount != null || sim.fixed_bv != null) warnings.push("Vaste RSZ/BV uit de individuele simulatie: controleer deze bedragen bij het sociaal secretariaat voor deze maand.");
  if (net < 0) warnings.push("Negatief nettoloon: controleer de geregistreerde uren en vaste inhoudingen. Dit is geen automatisch vastgestelde schuld.");

  const holidayPayReserve = profile.holiday_pay_enabled ? round2(gross * settings.holiday_pay_reserve_pct) : 0;
  const yearEndBonusReserve = profile.year_end_bonus_enabled ? round2(gross * settings.year_end_bonus_reserve_pct) : 0;
  const employerCost = round2(gross + rszEmployer + holidayPayReserve + yearEndBonusReserve + taxableAllowances + netAllowances + sim.employer_other_costs);

  if (studentOverQuota) warnings.push("Vanaf overschrijding is er ook bedrijfsvoorheffing verschuldigd — controleer met het sociaal secretariaat.");

  return {
    ...details,
    rszBasis,
    payable: money(net - advances),
    gross,
    rszEmployee,
    rszEmployer,
    taxable,
    bv,
    net,
    holidayPayReserve,
    yearEndBonusReserve,
    employerCost,
    warnings,
  };
}

export function statusLabel(status: PayrollStatus): string {
  switch (status) {
    case "employee": return "Vaste werknemer";
    case "temp": return "Uitzendkracht";
    case "student": return "Jobstudent";
    case "director": return "Bedrijfsleider";
  }
}
