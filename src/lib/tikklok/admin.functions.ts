import { assertAccountAdmin } from "@/lib/admin-accounts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type AuthClient = SupabaseClient<Database>;
import { createServerFn } from "@tanstack/react-start";
import { parseSalaryAdvances } from "@/lib/tikklok/salary-advances";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Tables } from "@/integrations/supabase/types";
import { splitWorkedMinutes } from "@/lib/tikklok/special-hours";
import { recordHoursChange } from "@/lib/tikklok/hours-history";

async function ensureAdmin(client: AuthClient, userId: string) {
  await assertAccountAdmin(client, userId);
}

async function ensurePinAvailable(pin: string, excludeEmployeeId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("tk_employees").select("id, pin");
  if (error) throw new Error("PIN-controle mislukt");
  for (const employee of data ?? []) {
    if (employee.id !== excludeEmployeeId && (await compare(pin, employee.pin))) {
      throw new Error("Deze PIN is al in gebruik");
    }
  }
}

export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("Rolcontrole mislukt");
    return { isAdmin: data === true };
  });

export type Administrator = {
  id: string;
  email: string;
  created_at: string;
};

export const listAdministrators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Administrator[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (error) throw new Error("Beheerders konden niet worden geladen");
    const users = await Promise.all(
      (roles ?? []).map(async ({ user_id }) => {
        const result = await supabaseAdmin.auth.admin.getUserById(user_id);
        if (result.error || !result.data.user) return null;
        return {
          id: result.data.user.id,
          email: result.data.user['email'] ?? "Geen e-mailadres",
          created_at: result.data.user.created_at,
        };
      }),
    );
    return users.filter((user): user is Administrator => user !== null);
  });

const newAdministratorSchema = z.object({
  email: z.string().trim()['email']("Vul een geldig e-mailadres in").max(255),
  password: z.string().min(12, "Wachtwoord moet minimaal 12 tekens bevatten").max(128),
});

export const createAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; password: string }) => newAdministratorSchema.parse(data))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data['email'],
      password: data.password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      if (createError?.message.toLowerCase().includes("already")) throw new Error("Dit e-mailadres heeft al een account");
      throw new Error("Beheerdersaccount aanmaken mislukt");
    }
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "admin" });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Beheerdersrol toekennen mislukt");
    }
    return { id: created.user.id, email: created.user['email'] ?? data['email'] };
  });

export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tk_employees")
      .select("id, name, active, created_at")
      .order("name");
    if (error) throw new Error("Kon personeelsleden niet ophalen");
    return data ?? [];
  });

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; pin: string }) => {
    const name = (data?.name ?? "").trim();
    const pin = (data?.pin ?? "").trim();
    if (name.length < 2 || name.length > 80) throw new Error("Naam moet 2-80 tekens zijn");
    if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN moet 4-8 cijfers zijn");
    return { name, pin };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    await ensurePinAvailable(data.pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pinHash = await hash(data.pin, 12);
    const { data: created, error } = await supabaseAdmin
      .from("tk_employees")
      .insert({ name: data.name, pin: pinHash })
      .select("id, name, active, created_at")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Deze PIN is al in gebruik");
      throw new Error("Aanmaken mislukt");
    }
    return created;
  });

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; name?: string; pin?: string; active?: boolean }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    const out: { id: string; name?: string; pin?: string; active?: boolean } = { id: data.id };
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (name.length < 2 || name.length > 80) throw new Error("Naam moet 2-80 tekens zijn");
      out.name = name;
    }
    if (data.pin !== undefined && data.pin !== "") {
      const pin = data.pin.trim();
      if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN moet 4-8 cijfers zijn");
      out.pin = pin;
    }
    if (data.active !== undefined) out.active = !!data.active;
    return out;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    if (patch.pin) {
      await ensurePinAvailable(patch.pin, id);
      patch.pin = await hash(patch.pin, 12);
    }
    const { error } = await supabaseAdmin.from("tk_employees").update(patch).eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("Deze PIN is al in gebruik");
      throw new Error("Bijwerken mislukt");
    }
    return { ok: true };
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_employees").delete().eq("id", data.id);
    if (error) throw new Error("Verwijderen mislukt");
    return { ok: true };
  });

export type ReportRow = {
  employee_id: string;
  employee_name: string;
  entry_id: string;
  clock_in: string;
  clock_out: string | null;
  minutes: number | null;
  day_minutes: number | null;
  special_minutes: number | null;
  split_special_hours: boolean;
  is_contractor: boolean;
  day_hourly_rate: number | null;
  special_hourly_rate: number | null;
  invoice_amount: number | null;
};

export type LiveStatusRow = {
  employee_id: string;
  employee_name: string;
  active: boolean;
  clocked_in: boolean;
  since: string | null;
  today_minutes: number;
};

export type TimeEntryRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  clock_in: string;
  clock_out: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export const listTimeEntryRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: "pending" | "approved" | "rejected" | "all" }) => ({
    status: data?.status ?? "pending",
  }))
  .handler(async ({ data, context }): Promise<TimeEntryRequestRow[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("tk_time_entry_requests")
      .select("id, employee_id, clock_in, clock_out, note, status, review_note, reviewed_at, created_at, employees:tk_employees!inner(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error("Aanvragen konden niet worden geladen");
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employees?.name ?? "Onbekend",
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      note: r.note,
      status: r.status,
      review_note: r.review_note,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
    }));
  });

export const reviewTimeEntryRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; action: "approve" | "reject"; review_note?: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    if (data.action !== "approve" && data.action !== "reject") throw new Error("Ongeldige actie");
    const note = typeof data.review_note === "string" ? data.review_note.trim().slice(0, 500) : "";
    return { id: data.id, action: data.action, review_note: note || null };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error: reqErr } = await supabaseAdmin
      .from("tk_time_entry_requests")
      .select("id, employee_id, clock_in, clock_out, status")
      .eq("id", data.id)
      .maybeSingle();
    if (reqErr || !req) throw new Error("Aanvraag niet gevonden");
    if (req.status !== "pending") throw new Error("Aanvraag is al beoordeeld");

    let approvedEntryId: string | null = null;
    if (data.action === "approve") {
      const { data: created, error: insErr } = await supabaseAdmin
        .from("tk_time_entries")
        .insert({ employee_id: req.employee_id, clock_in: req.clock_in, clock_out: req.clock_out })
        .select("id")
        .single();
      if (insErr) throw new Error("Registratie aanmaken mislukt");
      approvedEntryId = created.id;
    }

    const { error: updErr } = await supabaseAdmin
      .from("tk_time_entry_requests")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.review_note,
        approved_entry_id: approvedEntryId,
      })
      .eq("id", data.id);
    if (updErr) throw new Error("Beoordeling opslaan mislukt");
    return { ok: true };
  });

export const getLiveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LiveStatusRow[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: employees, error: empErr } = await supabaseAdmin
      .from("tk_employees")
      .select("id, name, active")
      .order("name");
    if (empErr) throw new Error("Kon personeel niet ophalen");

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: entries, error: entErr } = await supabaseAdmin
      .from("tk_time_entries")
      .select("employee_id, clock_in, clock_out")
      .gte("clock_in", startOfDay.toISOString());
    if (entErr) throw new Error("Kon registraties niet ophalen");

    const now = Date.now();
    return (employees ?? []).map((e) => {
      const mine = (entries ?? []).filter((x) => x.employee_id === e.id);
      const open = mine.find((x) => x.clock_out == null);
      let mins = 0;
      for (const x of mine) {
        const end = x.clock_out ? new Date(x.clock_out).getTime() : now;
        mins += Math.max(0, Math.round((end - new Date(x.clock_in).getTime()) / 60000));
      }
      return {
        employee_id: e.id,
        employee_name: e.name,
        active: e.active,
        clocked_in: !!open,
        since: open?.clock_in ?? null,
        today_minutes: mins,
      };
    });
  });

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { from: string; to: string }) => {
    if (!data?.from || !data?.to) throw new Error("Periode ontbreekt");
    return { from: data.from, to: data.to };
  })
  .handler(async ({ data, context }): Promise<ReportRow[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("tk_time_entries")
      .select("id, clock_in, clock_out, employee_id, employees:tk_employees!inner(id, name, employee_profiles:tk_employee_profiles(split_special_hours, is_contractor, day_hourly_rate, special_hourly_rate))")
      .gte("clock_in", data.from)
      .lte("clock_in", data.to)
      .order("clock_in", { ascending: false });

    if (error) throw new Error("Rapport kon niet worden geladen");

    return (rows ?? []).map((r: any) => {
      const profile = r.employees?.employee_profiles;
      const isContractor = Boolean(profile?.is_contractor);
      const splitEnabled = Boolean(profile?.split_special_hours) || isContractor;
      const split = splitWorkedMinutes(r.clock_in, r.clock_out);
      const dayRate = isContractor && profile?.day_hourly_rate != null ? Number(profile['day_hourly_rate']) : null;
      const specialRate = isContractor && profile?.special_hourly_rate != null ? Number(profile['special_hourly_rate']) : null;
      const invoiceAmount =
        split.dayMinutes == null || split.specialMinutes == null || dayRate == null || specialRate == null
          ? null
          : Math.round(((split.dayMinutes * dayRate + split.specialMinutes * specialRate) / 60) * 100) / 100;
      return {
        employee_id: r.employee_id,
        employee_name: r.employees?.name ?? "Onbekend",
        entry_id: r.id,
        clock_in: r.clock_in,
        clock_out: r.clock_out,
        minutes: split.totalMinutes,
        day_minutes: splitEnabled ? split.dayMinutes : null,
        special_minutes: splitEnabled ? split.specialMinutes : null,
        split_special_hours: splitEnabled,
        is_contractor: isContractor,
        day_hourly_rate: dayRate,
        special_hourly_rate: specialRate,
        invoice_amount: invoiceAmount,
      };
    });
  });

function parseISO(v: string, label: string) {
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error(`Ongeldige ${label}`);
  return d.toISOString();
}

export const updateTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; clock_in: string; clock_out: string | null }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    const clock_in = parseISO(data.clock_in, "inkloktijd");
    const clock_out = data.clock_out ? parseISO(data.clock_out, "uitkloktijd") : null;
    if (clock_out && new Date(clock_out) <= new Date(clock_in)) {
      throw new Error("Uitkloktijd moet na inkloktijd liggen");
    }
    return { id: data.id, clock_in, clock_out };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tk_time_entries")
      .update({ clock_in: data.clock_in, clock_out: data.clock_out })
      .eq("id", data.id);
    if (error) throw new Error("Bijwerken mislukt");
    return { ok: true };
  });

export const createManualTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employee_id: string; clock_in: string; clock_out: string }) => {
    if (!data?.employee_id) throw new Error("Personeelslid ontbreekt");
    const clock_in = parseISO(data.clock_in, "starttijd");
    const clock_out = parseISO(data.clock_out, "eindtijd");
    const duration = new Date(clock_out).getTime() - new Date(clock_in).getTime();
    if (duration <= 0) throw new Error("Eindtijd moet na starttijd liggen");
    if (duration > 24 * 60 * 60 * 1000) throw new Error("Een registratie mag maximaal 24 uur duren");
    return { employee_id: data.employee_id, clock_in, clock_out };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("tk_employees")
      .select("id")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (employeeError || !employee) throw new Error("Personeelslid niet gevonden");
    const { data: created, error } = await supabaseAdmin
      .from("tk_time_entries")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error("Uren toevoegen mislukt");
    return { ok: true, id: created.id };
  });

export const deleteTimeEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_time_entries").delete().eq("id", data.id);
    if (error) throw new Error("Verwijderen mislukt");
    return { ok: true };
  });

const optionalText = (value: unknown, max: number) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("Ongeldige tekstwaarde");
  const clean = value.trim();
  if (clean.length > max) throw new Error(`Waarde mag maximaal ${max} tekens bevatten`);
  return clean || null;
};

export type EmployeeDossier = {
  profile: Tables<"tk_employee_profiles"> | null;
  absences: Tables<"tk_employee_absences">[];
  notes: Tables<"tk_employee_notes">[];
  documents: Tables<"tk_employee_documents">[];
};

export const getEmployeeDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employeeId: string }) => {
    if (!data?.employeeId) throw new Error("Personeelslid ontbreekt");
    return data;
  })
  .handler(async ({ data, context }): Promise<EmployeeDossier> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, absences, notes, documents] = await Promise.all([
      supabaseAdmin.from("tk_employee_profiles").select("*").eq("employee_id", data.employeeId).maybeSingle(),
      supabaseAdmin.from("tk_employee_absences").select("*").eq("employee_id", data.employeeId).order("starts_on", { ascending: false }),
      supabaseAdmin.from("tk_employee_notes").select("*").eq("employee_id", data.employeeId).order("note_date", { ascending: false }),
      supabaseAdmin.from("tk_employee_documents").select("*").eq("employee_id", data.employeeId).order("created_at", { ascending: false }),
    ]);
    if (profile.error || absences.error || notes.error || documents.error) throw new Error("Personeelsdossier kon niet worden geladen");
    return { profile: profile.data, absences: absences.data ?? [], notes: notes.data ?? [], documents: documents.data ?? [] };
  });

export const saveEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Record<string, unknown> & { employee_id: string }) => {
    if (!data?.employee_id) throw new Error("Personeelslid ontbreekt");
    const email = optionalText(data['email'], 255);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Ongeldig e-mailadres");
    const weekly = data['weekly_hours'] === "" || data['weekly_hours'] == null ? null : Number(String(data['weekly_hours']).replace(",", "."));
    if (weekly != null && (!Number.isFinite(weekly) || weekly < 0 || weekly > 168)) throw new Error("Ongeldig urenregime");
    const scheduleKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
    const scheduleEntries = scheduleKeys.map((day) => {
      const raw = data[`schedule_${day}`];
      if (raw === "" || raw == null) return [day, 0] as const;
      const hours = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(hours) || hours < 0 || hours > 24) throw new Error("Ongeldige uren in het weekrooster");
      return [day, Math.round(hours * 100) / 100] as const;
    });
    const hasDailySchedule = scheduleKeys.some((day) => data[`schedule_${day}`] !== "" && data[`schedule_${day}`] != null);
    const dailySchedule = hasDailySchedule ? Object.fromEntries(scheduleEntries) : null;
    const scheduleTotal = scheduleEntries.reduce((sum, [, hours]) => sum + hours, 0);
    if (hasDailySchedule && weekly != null && Math.abs(scheduleTotal - weekly) > 0.01) {
      throw new Error(`Het weekrooster telt ${scheduleTotal.toLocaleString("nl-BE")} u, maar het contract vermeldt ${weekly.toLocaleString("nl-BE")} u`);
    }
    const isContractor = Boolean(data['is_contractor']);
    const parseRate = (value: unknown, label: string) => {
      if (value === "" || value == null) return null;
      const rate = Number(value);
      if (!Number.isFinite(rate) || rate < 0 || rate > 10000) throw new Error(`Ongeldig ${label}`);
      return Math.round(rate * 100) / 100;
    };
    const dayHourlyRate = parseRate(data['day_hourly_rate'], "dagtarief");
    const specialHourlyRate = parseRate(data['special_hourly_rate'], "avond- en weekendtarief");
    if (isContractor && (dayHourlyRate == null || specialHourlyRate == null)) {
      throw new Error("Vul beide uurtarieven in voor een onderaannemer");
    }
    return {
      employee_id: data.employee_id,
      email,
      phone: optionalText(data['phone'], 40),
      street_address: optionalText(data['street_address'], 160),
      postal_code: optionalText(data['postal_code'], 20),
      city: optionalText(data['city'], 80),
      country: optionalText(data['country'], 80),
      birth_date: optionalText(data['birth_date'], 10),
      birth_place: optionalText(data['birth_place'], 100),
      national_number: optionalText(data['national_number'], 30),
      iban: optionalText(data['iban'], 40),
      job_category: optionalText(data['job_category'], 100),
      joint_committee: optionalText(data['joint_committee'], 60),
      job_tasks: optionalText(data['job_tasks'], 1000),
      emergency_contact_name: optionalText(data['emergency_contact_name'], 100),
      emergency_contact_phone: optionalText(data['emergency_contact_phone'], 40),
      job_title: optionalText(data['job_title'], 100),
      department: optionalText(data['department'], 100),
      employment_start_date: optionalText(data['employment_start_date'], 10),
      hours_effective_from: (() => {
        const raw = optionalText(data['hours_effective_from'], 10);
        if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Ongeldige ingangsdatum voor de uren");
        return raw;
      })(),
      contract_type: optionalText(data['contract_type'], 80),
      weekly_hours: weekly,
      daily_schedule: dailySchedule,
      overtime_calculation_mode: data['overtime_calculation_mode'] === "weekly" ? "weekly" : "daily",
      salary_advances: (() => { const list = parseSalaryAdvances(String(data['salary_advances'] ?? "")); return list.length ? list : null; })(),
      salary_settlement_day: (() => { const d = Number(data['salary_settlement_day'] ?? 1) || 1; if (d < 1 || d > 31) throw new Error("Afrekeningsdag moet tussen 1 en 31 liggen"); return Math.round(d); })(),
      employment_status: ["active", "inactive", "leave", "ended"].includes(String(data['employment_status'])) ? String(data['employment_status']) : "active",
      monthly_report_enabled: Boolean(data['monthly_report_enabled']),
      split_special_hours: Boolean(data['split_special_hours']),
      is_contractor: isContractor,
      day_hourly_rate: isContractor ? dayHourlyRate : null,
      special_hourly_rate: isContractor ? specialHourlyRate : null,
    };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hours_effective_from: hoursEffectiveFrom, ...profileData } = data;

    // Fetch the current profile to detect a change in the hours regime.
    const { data: previous } = await supabaseAdmin
      .from("tk_employee_profiles")
      .select("weekly_hours, daily_schedule, employment_start_date")
      .eq("employee_id", data.employee_id)
      .maybeSingle();

    const defaultEffective = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
    await recordHoursChange(supabaseAdmin, data.employee_id, context.userId, previous,
      profileData['weekly_hours'], profileData.daily_schedule ?? null, hoursEffectiveFrom ?? defaultEffective);
    const { error } = await supabaseAdmin.from("tk_employee_profiles").upsert(profileData, { onConflict: "employee_id" });
    if (error) throw new Error("Profiel opslaan mislukt");
    return { ok: true };
  });

export const addEmployeeAbsence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employee_id: string; absence_type: string; starts_on: string; ends_on: string; notes?: string }) => {
    if (!data?.employee_id || !data.starts_on || !data.ends_on) throw new Error("Vul de periode volledig in");
    if (!["vacation", "sick", "unpaid", "other"].includes(data.absence_type)) throw new Error("Ongeldig afwezigheidstype");
    if (data.ends_on < data.starts_on) throw new Error("Einddatum moet na startdatum liggen");
    return { ...data, notes: optionalText(data.notes, 1000), status: "approved" };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_employee_absences").insert(data);
    if (error) throw new Error("Afwezigheid toevoegen mislukt");
    return { ok: true };
  });

export const addEmployeeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employee_id: string; title: string; content: string }) => {
    const title = optionalText(data?.title, 120);
    const content = optionalText(data?.content, 4000);
    if (!data?.employee_id || !title || !content) throw new Error("Titel en notitie zijn verplicht");
    return { employee_id: data.employee_id, title, content };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_employee_notes").insert({ ...data, created_by: context.userId });
    if (error) throw new Error("Notitie toevoegen mislukt");
    return { ok: true };
  });

export const registerEmployeeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employee_id: string; title: string; document_type: string; storage_path: string; file_name: string; mime_type: string; file_size: number }) => {
    const title = optionalText(data?.title, 120);
    if (!data?.employee_id || !title || !data.storage_path || !data.file_name) throw new Error("Documentgegevens ontbreken");
    if (!["contract", "certificate", "evaluation", "identity", "other"].includes(data.document_type)) throw new Error("Ongeldig documenttype");
    if (!Number.isInteger(data.file_size) || data.file_size <= 0 || data.file_size > 20 * 1024 * 1024) throw new Error("Document mag maximaal 20 MB zijn");
    if (!data.storage_path.startsWith(`${data.employee_id}/`)) throw new Error("Ongeldig documentpad");
    return { ...data, title, mime_type: optionalText(data.mime_type, 120) ?? "application/octet-stream" };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_employee_documents").insert(data);
    if (error) throw new Error("Document registreren mislukt");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Vakantie- en recuperatie-aanvragen (admin)
// ---------------------------------------------------------------------------

export type LeaveRequestRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  request_type: string;
  starts_on: string;
  ends_on: string;
  hours: number | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export const listLeaveRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: "pending" | "approved" | "rejected" | "all" }) => ({
    status: data?.status ?? "pending",
  }))
  .handler(async ({ data, context }): Promise<LeaveRequestRow[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("tk_leave_requests")
      .select(
        "id, employee_id, request_type, starts_on, ends_on, hours, note, status, review_note, reviewed_at, created_at, employees:tk_employees!inner(name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error("Verlofaanvragen konden niet worden geladen");
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employees?.name ?? "Onbekend",
      request_type: r.request_type,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      hours: r.hours == null ? null : Number(r.hours),
      note: r.note,
      status: r.status,
      review_note: r.review_note,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
    }));
  });

export const reviewLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; action: "approve" | "reject"; review_note?: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    if (data.action !== "approve" && data.action !== "reject") throw new Error("Ongeldige actie");
    const note = typeof data.review_note === "string" ? data.review_note.trim().slice(0, 500) : "";
    return { id: data.id, action: data.action, review_note: note || null };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error: reqErr } = await supabaseAdmin
      .from("tk_leave_requests")
      .select("id, employee_id, request_type, starts_on, ends_on, hours, note, status")
      .eq("id", data.id)
      .maybeSingle();
    if (reqErr || !req) throw new Error("Aanvraag niet gevonden");
    if (req.status !== "pending") throw new Error("Aanvraag is al beoordeeld");

    let absenceId: string | null = null;
    if (data.action === "approve") {
      const absenceType = req.request_type === "unpaid" ? "unpaid" : "vacation";
      const noteParts = [
        req.request_type === "overtime_recovery" ? `Recuperatie overuren (${Number(req.hours ?? 0)} u)` : "Aangevraagd via tikklok",
        req.note ?? "",
      ].filter(Boolean);
      const { data: created, error: insErr } = await supabaseAdmin
        .from("tk_employee_absences")
        .insert({
          employee_id: req.employee_id,
          absence_type: absenceType,
          starts_on: req.starts_on,
          ends_on: req.ends_on,
          status: "approved",
          notes: noteParts.join(" — "),
        })
        .select("id")
        .single();
      if (insErr) throw new Error("Afwezigheid aanmaken mislukt");
      absenceId = created.id;
    }

    const { error: updErr } = await supabaseAdmin
      .from("tk_leave_requests")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.review_note,
        absence_id: absenceId,
      })
      .eq("id", data.id);
    if (updErr) throw new Error("Beoordeling opslaan mislukt");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Overuren afboeken (admin)
// ---------------------------------------------------------------------------

export type OvertimeAdjustmentRow = {
  id: string;
  source_week: string;
  adjustment_type: "recovered" | "paid" | "extra";
  minutes: number;
  effective_on: string;
  note: string | null;
  created_at: string;
  leave_request_id: string | null;
};

export const getAdminOvertime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employeeId: string }) => {
    if (!data?.employeeId) throw new Error("Kies een medewerker");
    return { employeeId: data.employeeId };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: employee }, { data: profile }, { data: adjustments, error }] = await Promise.all([
      supabaseAdmin.from("tk_employees").select("id, name").eq("id", data.employeeId).maybeSingle(),
      supabaseAdmin.from("tk_employee_profiles").select("weekly_hours, employment_start_date, daily_schedule, overtime_calculation_mode").eq("employee_id", data.employeeId).maybeSingle(),
      supabaseAdmin.from("tk_overtime_adjustments").select("id, source_week, adjustment_type, minutes, effective_on, note, created_at, leave_request_id").eq("employee_id", data.employeeId).order("created_at", { ascending: false }),
    ]);
    if (!employee) throw new Error("Medewerker niet gevonden");
    if (error) throw new Error("Overurenhistoriek kon niet worden geladen");
    const { buildOvertime } = await import("@/lib/tikklok/hr.functions");
    const overtime = await buildOvertime(
      supabaseAdmin,
      employee.id,
      profile?.weekly_hours == null ? null : Number(profile['weekly_hours']),
      profile?.employment_start_date ?? null,
      profile?.daily_schedule ?? null,
      profile?.overtime_calculation_mode === "weekly" ? "weekly" : "daily",
    );
    return { employee, overtime, adjustments: (adjustments ?? []) as OvertimeAdjustmentRow[] };
  });

export const addOvertimeAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employeeId: string; sourceWeek: string; adjustmentType: "recovered" | "paid" | "extra"; hours: string | number; note?: string }) => {
    if (!data?.employeeId) throw new Error("Kies een medewerker");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.sourceWeek ?? "")) throw new Error("Ongeldige week");
    if (data.adjustmentType !== "recovered" && data.adjustmentType !== "paid" && data.adjustmentType !== "extra") throw new Error("Ongeldige verwerking");
    const hours = Number(String(data.hours ?? "").replace(",", "."));
    if (!Number.isFinite(hours) || hours <= 0) throw new Error("Geef een geldig aantal uren in");
    const minutes = Math.round(hours * 60);
    const note = typeof data.note === "string" ? data.note.trim().slice(0, 500) : "";
    return { employeeId: data.employeeId, sourceWeek: data.sourceWeek, adjustmentType: data.adjustmentType, minutes, note: note || null };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("tk_employee_profiles")
      .select("weekly_hours, employment_start_date, daily_schedule, overtime_calculation_mode")
      .eq("employee_id", data.employeeId)
      .maybeSingle();
    const { buildOvertime } = await import("@/lib/tikklok/hr.functions");
    const overtime = await buildOvertime(
      supabaseAdmin,
      data.employeeId,
      profile?.weekly_hours == null ? null : Number(profile['weekly_hours']),
      profile?.employment_start_date ?? null,
      profile?.daily_schedule ?? null,
      profile?.overtime_calculation_mode === "weekly" ? "weekly" : "daily",
    );
    const week = overtime.weeks.find((item) => item.weekStart === data.sourceWeek);
    if (!week || week.isCurrentWeek) throw new Error("Alleen een afgesloten week kan worden verwerkt");
    if (data.adjustmentType !== "extra") {
      if (week.openMinutes <= 0) throw new Error("Deze week heeft geen openstaande overuren");
      const availableMinutes = Math.max(0, Math.min(week.openMinutes, overtime.balanceMinutes));
      if (data.minutes > availableMinutes) throw new Error(`Maximaal ${Math.floor(availableMinutes / 60)}u ${String(availableMinutes % 60).padStart(2, "0")}m beschikbaar`);
    }
    const { error } = await supabaseAdmin.from("tk_overtime_adjustments").insert({
      employee_id: data.employeeId,
      source_week: data.sourceWeek,
      adjustment_type: data.adjustmentType,
      minutes: data.minutes,
      note: data.note,
      created_by: context.userId,
    });
    if (error) throw new Error("Overuren verwerken mislukt");
    return { ok: true };
  });

export const resetOvertimeAsPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employeeId: string; password: string; hours?: string; note?: string }) => {
    if (!data?.employeeId) throw new Error("Kies een medewerker");
    if (typeof data.password !== "string" || !data.password) throw new Error("Geef je wachtwoord in");
    let hoursMinutes: number | null = null;
    if (typeof data.hours === "string" && data.hours.trim() !== "") {
      const n = Number(data.hours.trim().replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) throw new Error("Geef een geldig aantal uren in");
      hoursMinutes = Math.round(n * 60);
    }
    return { employeeId: data.employeeId, password: data.password.slice(0, 200), hoursMinutes, note: typeof data.note === "string" ? data.note.trim().slice(0, 500) : "" };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const email = (context.claims as { email?: string })?.email;
    if (!email) throw new Error("Wachtwoord kon niet worden gecontroleerd");
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const authClient = createClient(process.env["SUPABASE_URL"]!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: pwError } = await authClient.auth.signInWithPassword({ email, password: data.password });
    if (pwError) throw new Error("Wachtwoord is onjuist");
    await authClient.auth.signOut().catch(() => {});

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("tk_employee_profiles")
      .select("weekly_hours, employment_start_date, daily_schedule, overtime_calculation_mode")
      .eq("employee_id", data.employeeId)
      .maybeSingle();
    const { buildOvertime } = await import("@/lib/tikklok/hr.functions");
    const overtime = await buildOvertime(
      supabaseAdmin,
      data.employeeId,
      profile?.weekly_hours == null ? null : Number(profile['weekly_hours']),
      profile?.employment_start_date ?? null,
      profile?.daily_schedule ?? null,
      profile?.overtime_calculation_mode === "weekly" ? "weekly" : "daily",
    );
    let remaining = overtime.balanceMinutes;
    if (remaining <= 0) throw new Error("Er staan geen overuren open");
    if (data.hoursMinutes != null) remaining = Math.min(remaining, data.hoursMinutes);
    const rows: { employee_id: string; source_week: string; adjustment_type: string; minutes: number; note: string; created_by: string }[] = [];
    for (const week of overtime.weeks) {
      if (remaining <= 0) break;
      const minutes = Math.min(week.openMinutes, remaining);
      if (minutes <= 0) continue;
      rows.push({ employee_id: data.employeeId, source_week: week.weekStart, adjustment_type: "paid", minutes, note: data.note || "Saldo gereset bij uitbetaling", created_by: context.userId });
      remaining -= minutes;
    }
    if (rows.length === 0) throw new Error("Er staan geen overuren open");
    const { error } = await supabaseAdmin.from("tk_overtime_adjustments").insert(rows);
    if (error) throw new Error("Resetten mislukt");
    const paidMinutes = overtime.balanceMinutes - remaining;
    return { ok: true, minutes: paidMinutes, remainingBalance: overtime.balanceMinutes - paidMinutes };
  });

export const deleteOvertimeAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Registratie ontbreekt");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adjustment } = await supabaseAdmin.from("tk_overtime_adjustments").select("leave_request_id").eq("id", data.id).maybeSingle();
    if (!adjustment) throw new Error("Registratie niet gevonden");
    if (adjustment.leave_request_id) throw new Error("Een overgenomen recuperatieaanvraag kan niet hier worden verwijderd");
    const { error } = await supabaseAdmin.from("tk_overtime_adjustments").delete().eq("id", data.id);
    if (error) throw new Error("Registratie verwijderen mislukt");
    return { ok: true };
  });

// ---- Berichten voor medewerkers ----

export type AdminMessageRow = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  title: string;
  body: string;
  active: boolean;
  expires_on: string | null;
  created_at: string;
  read_count: number;
};

export const listEmployeeMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminMessageRow[]> => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("tk_employee_messages")
      .select("id, employee_id, title, body, active, expires_on, created_at, employees:tk_employees(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Berichten konden niet worden geladen");
    const ids = (rows ?? []).map((r: any) => r.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: reads } = await supabaseAdmin
        .from("tk_employee_message_reads")
        .select("message_id")
        .in("message_id", ids);
      for (const r of reads ?? []) counts.set(r.message_id, (counts.get(r.message_id) ?? 0) + 1);
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employees?.name ?? null,
      title: r.title,
      body: r.body,
      active: r.active,
      expires_on: r.expires_on,
      created_at: r.created_at,
      read_count: counts.get(r.id) ?? 0,
    }));
  });

export const createEmployeeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employee_id?: string | null; title: string; body: string; expires_on?: string | null }) => {
    const title = (data?.title ?? "").trim();
    const body = (data?.body ?? "").trim();
    if (!title) throw new Error("Titel ontbreekt");
    if (!body) throw new Error("Bericht ontbreekt");
    return {
      employee_id: data.employee_id ? data.employee_id : null,
      title: title.slice(0, 120),
      body: body.slice(0, 2000),
      expires_on: data.expires_on ? data.expires_on : null,
    };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_employee_messages").insert({
      employee_id: data.employee_id,
      title: data.title,
      body: data.body,
      expires_on: data.expires_on,
      created_by: context.userId,
    });
    if (error) throw new Error("Bericht opslaan mislukt");
    return { ok: true };
  });

export const setEmployeeMessageActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; active: boolean }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    return { id: data.id, active: !!data.active };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_employee_messages").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error("Bijwerken mislukt");
    return { ok: true };
  });

export const deleteEmployeeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tk_employee_messages").delete().eq("id", data.id);
    if (error) throw new Error("Verwijderen mislukt");
    return { ok: true };
  });
