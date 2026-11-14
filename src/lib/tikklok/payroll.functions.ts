import { assertAccountAdmin } from "@/lib/admin-accounts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type AuthClient = SupabaseClient<Database>;
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { compare } from "bcryptjs";
import { requireApprovedDevice } from "@/lib/tikklok/device-access.server";
import {
  computePayroll,
  type PayrollComputationResult,
  type PayrollSettings,
  type PayrollStatus,
  statusLabel,
} from "@/lib/tikklok/payroll-engine";
import { splitWorkedMinutes } from "@/lib/tikklok/special-hours";
import { normalizeSimulation, simulationSchema, monthlyOvertimeMinutes } from "@/lib/tikklok/payroll-simulation";
import { normalizeAdvances } from "@/lib/tikklok/salary-advances";
import { fetchAll } from '@/lib/fetch-all';
import { contractMonth, personnelCost, completePersonnelTotal } from './personnel-budget';

async function ensureAdmin(client: AuthClient, userId: string) {
  await assertAccountAdmin(client, userId);
}

async function loadSettings(): Promise<PayrollSettings & { id: string; disclaimer: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("tk_payroll_settings").select("*").limit(1).maybeSingle();
  if (error || !data) throw new Error("Instellingen niet gevonden");
  return {
    id: data.id,
    employee_rsz_pct: Number(data.employee_rsz_pct),
    employer_rsz_pct: Number(data.employer_rsz_pct),
    student_employee_pct: Number(data.student_employee_pct),
    student_employer_pct: Number(data.student_employer_pct),
    student_yearly_hours_limit: data.student_yearly_hours_limit,
    holiday_pay_reserve_pct: Number(data.holiday_pay_reserve_pct),
    year_end_bonus_reserve_pct: Number(data.year_end_bonus_reserve_pct),
    bv_brackets: data.bv_brackets as any,
    dependent_reduction_per_person: Number(data.dependent_reduction_per_person),
    disclaimer: data.disclaimer,
  };
}

function monthRange(period: string) {
  // period = "YYYY-MM"
  const [y = 0, m = 0] = period.split("-").map(Number);
  if (!y || !m) throw new Error("Ongeldige periode");
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  return { from: from.toISOString(), to: to.toISOString(), firstDay: from.toISOString().slice(0, 10) };
}

// ---------- Settings ----------

export const getPayrollSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    return loadSettings();
  });

export const updatePayrollSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Partial<PayrollSettings> & { disclaimer?: string }) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const current = await loadSettings();
    const patch: any = {};
    const numericKeys: (keyof PayrollSettings)[] = [
      "employee_rsz_pct","employer_rsz_pct","student_employee_pct","student_employer_pct",
      "holiday_pay_reserve_pct","year_end_bonus_reserve_pct","dependent_reduction_per_person",
    ];
    for (const k of numericKeys) if (data[k] !== undefined) patch[k] = data[k];
    if (data.student_yearly_hours_limit !== undefined) patch.student_yearly_hours_limit = data.student_yearly_hours_limit;
    if (data.bv_brackets !== undefined) patch.bv_brackets = data.bv_brackets;
    if (data.disclaimer !== undefined) patch.disclaimer = data.disclaimer;
    const { error } = await supabaseAdmin.from("tk_payroll_settings").update(patch).eq("id", current.id);
    if (error) throw new Error("Instellingen opslaan mislukt");
    return { ok: true };
  });

// ---------- Profiles ----------

export type PayrollProfileRow = {
  employee_id: string;
  employee_name: string;
  status: PayrollStatus;
  status_label: string;
  barema: string | null;
  wage_mode: "monthly" | "hourly";
  monthly_wage: number | null;
  hourly_wage: number | null;
  weekly_hours: number | null;
  bv_scale: "I" | "II" | "III";
  dependents: number;
  holiday_pay_enabled: boolean;
  year_end_bonus_enabled: boolean;
  fixed_bv_monthly: number | null;
  notes: string | null;
  simulation_parameters: ReturnType<typeof normalizeSimulation>;
};

export const listPayrollProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayrollProfileRow[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emps, error: e1 } = await supabaseAdmin
      .from("tk_employees").select("id, name").order("name");
    if (e1) throw new Error("Kon personeel niet ophalen");
    const { data: profs, error: e2 } = await supabaseAdmin
      .from("tk_payroll_profiles").select("*");
    if (e2) throw new Error("Kon loonprofielen niet ophalen");
    const map = new Map((profs ?? []).map((p) => [p.employee_id, p]));
    return (emps ?? []).map((e) => {
      const p = map.get(e.id);
      const status = (p?.status ?? "employee") as PayrollStatus;
      return {
        employee_id: e.id,
        employee_name: e.name,
        status,
        status_label: statusLabel(status),
        barema: p?.barema ?? null,
        wage_mode: (p?.wage_mode ?? "monthly") as "monthly" | "hourly",
        monthly_wage: p?.monthly_wage != null ? Number(p.monthly_wage) : null,
        hourly_wage: p?.hourly_wage != null ? Number(p.hourly_wage) : null,
        weekly_hours: p?.weekly_hours != null ? Number(p.weekly_hours) : null,
        bv_scale: (p?.bv_scale ?? "I") as "I" | "II" | "III",
        dependents: p?.dependents ?? 0,
        holiday_pay_enabled: p?.holiday_pay_enabled ?? true,
        year_end_bonus_enabled: p?.year_end_bonus_enabled ?? true,
        fixed_bv_monthly: p?.fixed_bv_monthly != null ? Number(p.fixed_bv_monthly) : null,
        notes: p?.notes ?? null,
        simulation_parameters: normalizeSimulation(p?.simulation_parameters),
      };
    });
  });

const profileSchema = z.object({
  employee_id: z.string().uuid(),
  status: z.enum(["employee","temp","student","director"]),
  barema: z.string().max(80).nullable().optional(),
  wage_mode: z.enum(["monthly","hourly"]),
  monthly_wage: z.number().nonnegative().nullable().optional(),
  hourly_wage: z.number().nonnegative().nullable().optional(),
  weekly_hours: z.number().nonnegative().nullable().optional(),
  bv_scale: z.enum(["I","II","III"]),
  dependents: z.number().int().min(0).max(20),
  holiday_pay_enabled: z.boolean(),
  year_end_bonus_enabled: z.boolean(),
  fixed_bv_monthly: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  simulation_parameters: simulationSchema.optional(),
});

export const savePayrollProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: any) => profileSchema.parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tk_payroll_profiles")
      .upsert({ employee_id: data.employee_id, status: data.status, wage_mode: data.wage_mode, bv_scale: data.bv_scale, dependents: data.dependents, holiday_pay_enabled: data.holiday_pay_enabled, year_end_bonus_enabled: data.year_end_bonus_enabled, barema: data.barema ?? null, monthly_wage: data.monthly_wage ?? null, hourly_wage: data.hourly_wage ?? null, weekly_hours: data.weekly_hours ?? null, fixed_bv_monthly: data.fixed_bv_monthly ?? null, notes: data.notes ?? null, simulation_parameters: data.simulation_parameters ?? {} }, { onConflict: "employee_id" });
    if (error) throw new Error("Loonprofiel opslaan mislukt");
    return { ok: true };
  });

// ---------- Runs (calculation) ----------

async function workedMinutesForEmployee(employeeId: string, fromISO: string, toISO: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tk_time_entries")
    .select("clock_in, clock_out")
    .eq("employee_id", employeeId)
    .gte("clock_in", fromISO)
    .lt("clock_in", toISO);
  if (error) throw new Error("Uren ophalen mislukt");
  let total = 0, day = 0, special = 0;
  const days = new Set<string>();
  for (const row of data ?? []) {
    const split = splitWorkedMinutes(row.clock_in, row.clock_out);
    total += split.totalMinutes ?? 0;
    if ((split.totalMinutes ?? 0) > 0) days.add(new Date(row.clock_in).toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" }));
    day += split.dayMinutes ?? 0;
    special += split.specialMinutes ?? 0;
  }
  return { total, day, special, days: days.size };
}

async function studentHoursThisYear(employeeId: string, period: string) {
  const [y = 0] = period.split("-").map(Number);
  const from = new Date(Date.UTC(y, 0, 1)).toISOString();
  const to = new Date(Date.UTC(y + 1, 0, 1)).toISOString();
  const w = await workedMinutesForEmployee(employeeId, from, to);
  return w.total / 60;
}

export const calculatePayrollMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { period: string; preview?: boolean }) => {
    if (!/^\d{4}-\d{2}$/.test(data?.period ?? "")) throw new Error("Ongeldige periode (YYYY-MM)");
    return { period: data.period, preview: data.preview === true };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadSettings();
    const { from, to, firstDay } = monthRange(data.period);

    const { data: emps, error } = await supabaseAdmin
      .from("tk_employees")
      .select("id, name, active, payroll_profiles:tk_payroll_profiles(status, wage_mode, monthly_wage, hourly_wage, bv_scale, dependents, holiday_pay_enabled, year_end_bonus_enabled, fixed_bv_monthly, barema, weekly_hours, simulation_parameters), employee_profiles:tk_employee_profiles(*)")
      .eq("active", true);
    if (error) throw new Error("Kon personeel niet ophalen");

    const rows: any[] = [];
    for (const e of emps ?? []) {
      const p = (e as any).payroll_profiles as any;
      if (!p) continue; // geen profiel → niet berekenen
      const worked = await workedMinutesForEmployee(e.id, from, to);
      let yearHours: number | undefined = undefined;
      if (p.status === "student") yearHours = (await studentHoursThisYear(e.id, data.period)) - worked.total / 60;

      const hr = (e as any).employee_profiles;
      const { buildOvertime } = await import("@/lib/tikklok/hr.functions");
      const overtime = await buildOvertime(supabaseAdmin, e.id, hr?.weekly_hours == null ? null : Number(hr.weekly_hours), hr?.employment_start_date, hr?.daily_schedule, hr?.overtime_calculation_mode === "weekly" ? "weekly" : "daily", true);
      const bankedMinutes = monthlyOvertimeMinutes(overtime.weeks, data.period);
      const advances = normalizeAdvances(hr?.salary_advances).reduce((sum, a) => sum + a.amount, 0);
      const simulation = normalizeSimulation(p.simulation_parameters);
      const result = computePayroll({
        profile: {
          status: p.status,
          wage_mode: p.wage_mode,
          monthly_wage: p.monthly_wage != null ? Number(p.monthly_wage) : null,
          hourly_wage: p.hourly_wage != null ? Number(p.hourly_wage) : null,
          bv_scale: p.bv_scale,
          dependents: p.dependents,
          holiday_pay_enabled: p.holiday_pay_enabled,
          year_end_bonus_enabled: p.year_end_bonus_enabled,
          fixed_bv_monthly: p.fixed_bv_monthly != null ? Number(p.fixed_bv_monthly) : null,
        },
        settings,
        workedMinutes: worked.total,
        studentYearHoursSoFar: yearHours,
        workedDays: worked.days,
        bankedOvertimeMinutes: p.status === "temp" || p.status === "director" ? 0 : bankedMinutes,
        advances, simulation,
      });

      rows.push({
        employee_id: e.id,
        period_month: firstDay,
        status: p.status,
        worked_minutes: worked.total,
        worked_day_minutes: worked.day,
        worked_special_minutes: worked.special,
        gross: result.gross,
        rsz_employee: result.rszEmployee,
        rsz_employer: result.rszEmployer,
        taxable: result.taxable,
        bv: result.bv,
        net: result.net,
        holiday_pay_reserve: result.holidayPayReserve,
        year_end_bonus_reserve: result.yearEndBonusReserve,
        employer_cost: result.employerCost,
        warnings: result.warnings,
        snapshot: { profile: p, settings, workedMinutes: worked.total, workedDays: worked.days, bankedOvertimeMinutes: bankedMinutes, overtimeOpenMinutes: overtime.balanceMinutes, breakdown: result },
      });
    }

    if (rows.length > 0 && !data.preview) {
      const { error: upErr } = await supabaseAdmin
        .from("tk_payroll_runs")
        .upsert(rows, { onConflict: "employee_id,period_month" });
      if (upErr) throw new Error("Berekening opslaan mislukt");
    }
    return { calculated: rows.length, preview: data.preview ? rows : [] };
  });

export type PayrollRunRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  status: PayrollStatus;
  status_label: string;
  period_month: string;
  worked_minutes: number;
  gross: number;
  rsz_employee: number;
  rsz_employer: number;
  taxable: number;
  bv: number;
  net: number;
  employer_cost: number;
  holiday_pay_reserve: number;
  year_end_bonus_reserve: number;
  warnings: string[];
  paid_at: string | null;
  hourly_wage: number | null;
  monthly_wage: number | null;
  wage_mode: "monthly" | "hourly";
  overtime_open_minutes: number;
  job_category: string | null;
  job_title: string | null;
  breakdown: PayrollComputationResult | null;
  overtime_value: number;
  banked_overtime_minutes: number;
  payable: number;
};

async function loadPayrollRunRows(period: string): Promise<PayrollRunRow[]> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { firstDay } = monthRange(period);
    const { data: rows, error } = await supabaseAdmin
      .from("tk_payroll_runs")
      .select("id, employee_id, period_month, status, worked_minutes, gross, rsz_employee, rsz_employer, taxable, bv, net, employer_cost, holiday_pay_reserve, year_end_bonus_reserve, warnings, paid_at, snapshot, employees:tk_employees!inner(name)")
      .eq("period_month", firstDay)
      .order("employees:tk_employees(name)", { ascending: true });
    if (error) throw new Error("Loongegevens ophalen mislukt");
    const ids = (rows ?? []).map((r: any) => r.employee_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("tk_employee_profiles").select("employee_id, weekly_hours, employment_start_date, daily_schedule, overtime_calculation_mode, job_category, job_title").in("employee_id", ids)
      : { data: [] as any[] };
    const pmap = new Map((profiles ?? []).map((p: any) => [p.employee_id, p]));
    const { buildOvertime } = await import("@/lib/tikklok/hr.functions");
    const overtimeMap = new Map<string, number>();
    for (const id of ids) {
      const p: any = pmap.get(id);
      try {
        const o = await buildOvertime(supabaseAdmin, id, p?.weekly_hours == null ? null : Number(p.weekly_hours), p?.employment_start_date ?? null, p?.daily_schedule ?? null, p?.overtime_calculation_mode === "weekly" ? "weekly" : "daily");
        overtimeMap.set(id, Math.max(0, o.balanceMinutes));
      } catch { overtimeMap.set(id, 0); }
    }
    return (rows ?? []).map((r: any) => ({
      paid_at: r.paid_at ?? null,
      hourly_wage: r.snapshot?.profile?.hourly_wage != null ? Number(r.snapshot.profile.hourly_wage) : null,
      monthly_wage: r.snapshot?.profile?.monthly_wage != null ? Number(r.snapshot.profile.monthly_wage) : null,
      wage_mode: r.snapshot?.profile?.wage_mode === "hourly" ? "hourly" : "monthly",
      overtime_open_minutes: r.snapshot?.overtimeOpenMinutes ?? overtimeMap.get(r.employee_id) ?? 0,
      breakdown: r.snapshot?.breakdown ?? null,
      overtime_value: Math.round((r.snapshot?.overtimeOpenMinutes ?? overtimeMap.get(r.employee_id) ?? 0) / 60 * Number(r.snapshot?.profile?.hourly_wage ?? 0) * 1.5 * 100) / 100,
      banked_overtime_minutes: r.snapshot?.bankedOvertimeMinutes ?? 0,
      payable: r.snapshot?.breakdown?.payable ?? Number(r.net),
      job_category: (pmap.get(r.employee_id) as any)?.job_category ?? null,
      job_title: (pmap.get(r.employee_id) as any)?.job_title ?? null,
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employees?.name ?? "Onbekend",
      status: r.status as PayrollStatus,
      status_label: statusLabel(r.status as PayrollStatus),
      period_month: r.period_month,
      worked_minutes: r.worked_minutes,
      gross: Number(r.gross),
      rsz_employee: Number(r.rsz_employee),
      rsz_employer: Number(r.rsz_employer),
      taxable: Number(r.taxable),
      bv: Number(r.bv),
      net: Number(r.net),
      employer_cost: Number(r.employer_cost),
      holiday_pay_reserve: Number(r.holiday_pay_reserve),
      year_end_bonus_reserve: Number(r.year_end_bonus_reserve),
      warnings: (r.warnings as string[]) ?? [],
    }));
}

export const listPayrollRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { period: string }) => {
    if (!/^\d{4}-\d{2}$/.test(data?.period ?? "")) throw new Error("Ongeldige periode");
    return { period: data.period };
  })
  .handler(async ({ data, context }): Promise<PayrollRunRow[]> => {
    await ensureAdmin(context.supabase, context.userId);
    return loadPayrollRunRows(data.period);
  });

export const markPayrollPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { period: string; paid: boolean }) => {
    if (!/^\d{4}-\d{2}$/.test(data?.period ?? "")) throw new Error("Ongeldige periode");
    return { period: data.period, paid: data.paid !== false };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { firstDay } = monthRange(data.period);
    const { error } = await supabaseAdmin
      .from("tk_payroll_runs")
      .update(data.paid ? { paid_at: new Date().toISOString(), paid_by: context.userId } : { paid_at: null, paid_by: null })
      .eq("period_month", firstDay);
    if (error) throw new Error("Status opslaan mislukt");
    return { ok: true };
  });

export const getPayslipCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("tk_company_settings").select("company_name, street_address, postal_code, city, enterprise_number, rsz_number").limit(1).maybeSingle();
    return data ?? { company_name: "", street_address: null, postal_code: null, city: null, enterprise_number: null, rsz_number: null };
  });

export const exportPayrollCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { period: string }) => {
    if (!/^\d{4}-\d{2}$/.test(data?.period ?? "")) throw new Error("Ongeldige periode");
    return { period: data.period };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const rows = await loadPayrollRunRows(data.period);
    const header = ["Periode","Naam","Statuut","Gewerkte uren","Reguliere uren","Bruto","RSZ-basis","RSZ werknemer","RSZ werkgever","Belastbaar","Bedrijfsvoorheffing","Nettovergoedingen","Inhoudingen","Netto","Voorschotten","Te betalen","Loonkost werkgever","Opgespaarde overuren maand","Openstaande overuren","Overurenwaarde 150%"].join(";");
    const n = (v: number) => v.toFixed(2).replace(".", ",");
    const lines = rows.map((r) => [r.period_month, `"${r.employee_name.replace(/"/g, '""')}"`, r.status,
      n(r.worked_minutes / 60), n((r.breakdown?.regularMinutes ?? r.worked_minutes) / 60), n(r.gross), n(r.breakdown?.rszBasis ?? r.gross), n(r.rsz_employee), n(r.rsz_employer), n(r.taxable), n(r.bv), n(r.breakdown?.netAllowances ?? 0), n(r.breakdown?.deductions ?? 0), n(r.net), n(r.breakdown?.advances ?? 0), n(r.payable), n(r.employer_cost), n(r.banked_overtime_minutes / 60), n(r.overtime_open_minutes / 60), n(r.overtime_value)].join(";"));
    return { csv: [header, ...lines].join("\n"), filename: `loonexport-${data.period}.csv` };
  });

// Finance estimates: no payroll runs or journal entries are written.
const personnelInput = z.object({ companyId: z.string().uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

async function personnelEstimate(client: AuthClient, userId: string, companyId: string, period: string) {
  await ensureAdmin(client, userId);
  const { data: company, error } = await client.from('companies').select('id').eq('id', companyId).eq('user_id', userId).eq('name', 'Riory BV').maybeSingle();
  if (error || !company) throw new Error('Geen toegang tot dit Riory-bedrijf');
  const settings = await loadSettings();
  const month = Number(period.slice(5));
  const next = new Date(Date.UTC(Number(period.slice(0, 4)), month, 1)).toISOString().slice(0, 7);
  const offset = (m: number) => m >= 4 && m <= 10 ? '+02:00' : '+01:00';
  const from = new Date(`${period}-01T00:00:00${offset(month)}`).toISOString();
  const to = new Date(`${next}-01T00:00:00${offset(Number(next.slice(5)))}`).toISOString();
  const [employees, profiles, hrProfiles, history, entries] = await Promise.all([
    fetchAll((a, b) => client.from('tk_employees').select('id,name,active').order('id').range(a, b)),
    fetchAll((a, b) => client.from('tk_payroll_profiles').select('*').order('id').range(a, b)),
    fetchAll((a, b) => client.from('tk_employee_profiles').select('employee_id,weekly_hours,daily_schedule,employment_start_date,is_contractor,overtime_calculation_mode').order('employee_id').range(a, b)),
    fetchAll((a, b) => client.from('tk_employee_hours_history').select('id,employee_id,effective_from,weekly_hours,daily_schedule').order('id').range(a, b)),
    fetchAll((a, b) => client.from('tk_time_entries').select('id,employee_id,clock_in,clock_out').lt('clock_in', to).or(`clock_out.gte.${from},clock_out.is.null`).order('id').range(a, b)),
  ]);
  const rows = [];
  for (const e of employees) {
    const employeeEntries = entries.filter(r => r.employee_id === e.id);
    if (!e.active && !employeeEntries.length) continue;
    const p = profiles.find(r => r.employee_id === e.id);
    const hr = hrProfiles.find(r => r.employee_id === e.id);
    if (hr?.is_contractor) continue;
    const contract = contractMonth(period, hr?.weekly_hours ?? p?.weekly_hours ?? null, hr?.daily_schedule, hr?.employment_start_date ?? null, history.filter(h => h.employee_id === e.id));
    let minutes = 0;
    const workedDays = new Set<string>();
    for (const entry of employeeEntries) {
      if (!entry.clock_out) continue;
      const start = new Date(Math.max(Date.parse(from), Date.parse(entry.clock_in)));
      const end = new Date(Math.min(Date.parse(to), Date.parse(entry.clock_out)));
      const duration = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      minutes += duration;
      if (duration) workedDays.add(start.toLocaleDateString('en-CA', { timeZone: 'Europe/Brussels' }));
    }
    const warnings = [];
    let budget: number | null = null, estimated: number | null = null;
    if (!p) warnings.push('Loonprofiel ontbreekt');
    else {
      const input = { profile: { ...p, status: p.status as PayrollStatus, wage_mode: p.wage_mode as 'monthly' | 'hourly', bv_scale: p.bv_scale as 'I' | 'II' | 'III' }, settings, simulation: normalizeSimulation(p.simulation_parameters) };
      budget = !e.active ? null : contract.complete || p.wage_mode === 'monthly' || p.status === 'director'
        ? personnelCost({ ...input, workedMinutes: contract.minutes, workedDays: contract.workdays }, contract.employedFraction) : null;
      if (!contract.complete) warnings.push('Contracturen ontbreken');
      let bankedMinutes = 0;
      if (p.status !== 'temp' && p.status !== 'director') {
        const { buildOvertime } = await import('@/lib/tikklok/hr.functions');
        const o = await buildOvertime(client, e.id, hr?.weekly_hours ?? null, hr?.employment_start_date, hr?.daily_schedule, hr?.overtime_calculation_mode === 'weekly' ? 'weekly' : 'daily', true);
        bankedMinutes = monthlyOvertimeMinutes(o.weeks, period);
      }
      const studentYearHoursSoFar = p.status === 'student' ? Math.max(0, (await studentHoursThisYear(e.id, period)) - minutes / 60) : undefined;
      estimated = personnelCost({ ...input, workedMinutes: minutes, workedDays: workedDays.size, bankedOvertimeMinutes: bankedMinutes, studentYearHoursSoFar }, contract.employedFraction);
      if (p.status === 'student') warnings.push('Contractbudget met studentbijdrage: jaarquotum afzonderlijk controleren');
      if (p.status === 'temp') warnings.push('Uitzendkost vereist het tarief van het uitzendkantoor');
      if (budget == null || estimated == null) warnings.push('Kostenraming onvolledig');
    }
    if (employeeEntries.some(r => !r.clock_out)) warnings.push('Open klokregistratie niet meegerekend');
    rows.push({ id: e.id, name: e.name, contractHours: contract.minutes / 60, workedHours: minutes / 60, budget, estimated, warnings });
  }
  return { rows, budget: completePersonnelTotal(rows.map(r => r.budget)), estimated: completePersonnelTotal(rows.map(r => r.estimated)) };
}

export const getPersonnelBudget = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => personnelInput.parse(data))
  .handler(({ data, context }) => personnelEstimate(context.supabase, context.userId, data.companyId, data.period));

export const savePersonnelBudget = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => personnelInput.parse(data))
  .handler(async ({ data, context }) => {
    const estimate = await personnelEstimate(context.supabase, context.userId, data.companyId, data.period);
    if (estimate.budget == null) throw new Error('Vul eerst de ontbrekende loon- en contractgegevens aan');
    const { error } = await context.supabase.from('fin_budgets').upsert({ company_id: data.companyId, month: `${data.period}-01`, category: 'Personeel & zaakvoerder (62)', amount: estimate.budget }, { onConflict: 'company_id,month,category' });
    if (error) throw new Error('Personeelsbudget opslaan mislukt');
    return { amount: estimate.budget };
  });

// ---------- Employee-side (via PIN) ----------

const pinValidator = (data: { pin: string; deviceToken: string }) => {
  const pin = (data?.pin ?? "").trim();
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Ongeldige PIN");
  const deviceToken = data.deviceToken?.trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(deviceToken)) throw new Error("Dit toestel is niet goedgekeurd");
  return { pin, deviceToken };
};

export const getMyPayslips = createServerFn({ method: "POST" })
  .inputValidator(pinValidator)
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employees, error } = await supabaseAdmin
      .from("tk_employees").select("id, name, active, pin").eq("active", true);
    if (error) throw new Error("Databasefout");
    let employee: (typeof employees)[number] | undefined;
    for (const c of employees ?? []) if (await compare(data.pin, c.pin)) { employee = c; break; }
    if (!employee) throw new Error("PIN niet herkend");

    const { data: runs, error: rErr } = await supabaseAdmin
      .from("tk_payroll_runs")
      .select("period_month, gross, rsz_employee, bv, net, worked_minutes, status, snapshot")
      .eq("employee_id", employee.id)
      .order("period_month", { ascending: false })
      .limit(12);
    if (rErr) throw new Error("Loonstroken ophalen mislukt");
    const settings = await loadSettings();
    return {
      name: employee.name,
      disclaimer: settings.disclaimer,
      payslips: (runs ?? []).map((r) => ({
        period_month: r.period_month,
        status: r.status,
        worked_minutes: r.worked_minutes,
        gross: Number(r.gross),
        rsz_employee: Number(r.rsz_employee),
        bv: Number(r.bv),
        net: Number(r.net),
        payable: (r.snapshot as any)?.breakdown?.payable ?? Number(r.net),
        advances: (r.snapshot as any)?.breakdown?.advances ?? 0,
        banked_overtime_minutes: (r.snapshot as any)?.bankedOvertimeMinutes ?? 0,
      })),
    };
  });
