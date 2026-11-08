import { assertAccountAdmin } from "@/lib/admin-accounts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type AuthClient = SupabaseClient<Database>;
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CompanySettings, ContractRow, ContractType } from "@/lib/tikklok/contract-types";
import { CONTRACT_TYPES, selectedContractBenefits } from "@/lib/tikklok/contract-types";
import { recordHoursChange } from "@/lib/tikklok/hours-history";
import { canEmployerSign, validateDrawnSignature } from "@/lib/tikklok/contract-signature-rules";

const TYPES = new Set(CONTRACT_TYPES.map((t) => t.value));

async function ensureAdmin(client: AuthClient, userId: string) {
  await assertAccountAdmin(client, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const dateOrNull = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const numOrNull = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

// ---------------------------------------------------------------------------
// Firmagegevens
// ---------------------------------------------------------------------------

export const getCompanySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanySettings> => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin
      .from("tk_company_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Firmagegevens konden niet worden geladen");
    if (data) return data as CompanySettings;
    const { data: created, error: insErr } = await supabaseAdmin
      .from("tk_company_settings")
      .insert({ company_name: "" })
      .select("*")
      .single();
    if (insErr) throw new Error("Firmagegevens konden niet worden aangemaakt");
    return created as CompanySettings;
  });

export const saveCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Partial<CompanySettings> & { id: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    return {
      id: data.id,
      company_name: text(data.company_name, 150),
      legal_form: text(data.legal_form, 30) || null,
      street_address: text(data.street_address, 150) || null,
      postal_code: text(data.postal_code, 20) || null,
      city: text(data.city, 100) || null,
      country: text(data.country, 60) || "België",
      enterprise_number: text(data.enterprise_number, 40) || null,
      vat_number: text(data.vat_number, 40) || null,
      rsz_number: text(data.rsz_number, 40) || null,
      joint_committee: text(data.joint_committee, 60) || null,
      representative_name: text(data.representative_name, 120) || null,
      representative_role: text(data.representative_role, 120) || null,
      phone: text(data.phone, 40) || null,
      email: text(data.email, 120) || null,
      website: text(data.website, 120) || null,
      workplace_address: text(data.workplace_address, 200) || null,
      insurance_company: text(data.insurance_company, 120) || null,
      social_secretariat: text(data.social_secretariat, 120) || null,
      default_weekly_hours: numOrNull(data.default_weekly_hours) ?? 38,
      default_schedule: text(data.default_schedule, 500) || null,
      extra_clauses: text(data.extra_clauses, 2000) || null,
    };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);
    const { id, ...fields } = data;
    const { error } = await supabaseAdmin.from("tk_company_settings").update(fields).eq("id", id);
    if (error) throw new Error("Opslaan mislukt");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Contracten
// ---------------------------------------------------------------------------

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContractRow[]> => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin
      .from("tk_employment_contracts")
      .select("*, employees:tk_employees(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Contracten konden niet worden geladen");
    return (data ?? []).map((row: any) => {
      const { employees, params: _params, ...rest } = row;
      return { ...rest, employee_name: employees?.name ?? null } as ContractRow;
    });
  });

// Leidt een contracttype af uit de vrije tekst in het dossier.
function guessContractType(raw: string | null, isContractor: boolean | null): ContractType {
  const value = (raw ?? "").toLowerCase();
  if (isContractor) return "self_employed";
  if (/student|jobstudent/.test(value)) return "student";
  if (/zelfstandig|bedrijfsleider|onderaannem|freelance/.test(value)) return "self_employed";
  if (/bepaalde duur|tijdelijk|interim|uitzend|fixed/.test(value) && !/onbepaalde/.test(value)) return "fixed_term";
  return "indefinite";
}

export type ContractDefaults = {
  employee_name: string;
  contract_type: ContractType;
  job_title: string;
  workplace: string;
  starts_on: string;
  weekly_hours: string;
  schedule: string;
  wage_mode: "monthly" | "hourly";
  wage_amount: string;
  joint_committee: string;
  is_contractor: boolean;
  national_number: string;
  missing: string[];
};

export const getContractDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { employee_id: string }) => {
    if (!data?.employee_id) throw new Error("Kies een medewerker");
    return { employee_id: data.employee_id };
  })
  .handler(async ({ data, context }): Promise<ContractDefaults> => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);

    const [{ data: employee }, { data: profile }, { data: payroll }, { data: company }] = await Promise.all([
      supabaseAdmin.from("tk_employees").select("id, name").eq("id", data.employee_id).maybeSingle(),
      supabaseAdmin
        .from("tk_employee_profiles")
        .select(
          "job_title, department, contract_type, employment_start_date, weekly_hours, is_contractor, day_hourly_rate, national_number, joint_committee",
        )
        .eq("employee_id", data.employee_id)
        .maybeSingle(),
      supabaseAdmin
        .from("tk_payroll_profiles")
        .select("wage_mode, monthly_wage, hourly_wage, weekly_hours, status")
        .eq("employee_id", data.employee_id)
        .maybeSingle(),
      supabaseAdmin
        .from("tk_company_settings")
        .select("workplace_address, joint_committee, default_weekly_hours, default_schedule")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!employee) throw new Error("Medewerker niet gevonden");

    const wageMode: "monthly" | "hourly" = payroll?.wage_mode === "hourly" ? "hourly" : "monthly";
    const wageAmount =
      wageMode === "hourly"
        ? (payroll?.hourly_wage ?? profile?.day_hourly_rate ?? null)
        : (payroll?.monthly_wage ?? null);
    const weeklyHours = profile?.weekly_hours ?? payroll?.weekly_hours ?? company?.default_weekly_hours ?? null;

    const contractType =
      payroll?.status === "student"
        ? "student"
        : payroll?.status === "director"
          ? "self_employed"
          : guessContractType(profile?.contract_type ?? null, profile?.is_contractor ?? null);

    const missing: string[] = [];
    if (!profile) missing.push("het volledige dossier");
    if (!profile?.job_title) missing.push("functie");
    if (!profile?.employment_start_date) missing.push("startdatum");
    if (weeklyHours == null) missing.push("uren per week");
    if (wageAmount == null) missing.push("brutoloon");

    return {
      employee_name: employee.name,
      contract_type: contractType,
      job_title: profile?.job_title ?? "",
      workplace: company?.workplace_address ?? "",
      starts_on: profile?.employment_start_date ?? "",
      weekly_hours: weeklyHours == null ? "" : String(weeklyHours).replace(".", ","),
      schedule: company?.default_schedule ?? "",
      wage_mode: wageMode,
      wage_amount: wageAmount == null ? "" : String(wageAmount).replace(".", ","),
      joint_committee: profile?.joint_committee || company?.joint_committee || "",
      is_contractor: profile?.is_contractor ?? false,
      national_number: profile?.national_number ?? "",
      missing,
    };
  });

type GenerateInput = {
  employee_id: string;
  contract_type: string;
  job_title?: string;
  workplace?: string;
  starts_on?: string;
  ends_on?: string | null;
  weekly_hours?: number | string | null;
  schedule?: string;
  wage_mode?: string;
  wage_amount?: number | string | null;
  joint_committee?: string;
  trial_clause?: string;
  notice_clause?: string;
  extra_clauses?: string;
  student_yearly_hours?: number | string | null;
  national_number?: string;
  benefits?: string[];
};

export const generateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: GenerateInput) => {
    if (!data?.employee_id) throw new Error("Kies een medewerker");
    const contractType = text(data.contract_type, 30) as ContractType;
    if (!TYPES.has(contractType)) throw new Error("Ongeldig contracttype");
    const startsOn = dateOrNull(data.starts_on);
    if (!startsOn) throw new Error("Geef een startdatum in");
    const endsOn = dateOrNull(data.ends_on);
    if ((contractType === "fixed_term" || contractType === "student") && !endsOn) {
      throw new Error("Voor dit contracttype is een einddatum wettelijk verplicht");
    }
    if (endsOn && endsOn < startsOn) throw new Error("De einddatum moet na de startdatum liggen");
    const jobTitle = text(data.job_title, 120);
    if (!jobTitle) throw new Error("Geef de functie in");
    const wageMode = data.wage_mode === "hourly" ? "hourly" : "monthly";
    return {
      employee_id: data.employee_id,
      contract_type: contractType,
      job_title: jobTitle,
      workplace: text(data.workplace, 200),
      starts_on: startsOn,
      ends_on: endsOn,
      weekly_hours: numOrNull(data.weekly_hours),
      schedule: text(data.schedule, 500),
      wage_mode: wageMode as "monthly" | "hourly",
      wage_amount: numOrNull(data.wage_amount),
      joint_committee: text(data.joint_committee, 60),
      trial_clause: text(data.trial_clause, 1000),
      notice_clause: text(data.notice_clause, 1000),
      extra_clauses: text(data.extra_clauses, 2000),
      student_yearly_hours: numOrNull(data.student_yearly_hours),
      national_number: text(data.national_number, 30),
      benefits: selectedContractBenefits(data.benefits).map((benefit) => benefit.value),
    };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);
    const { buildContractBody } = await import("@/lib/tikklok/contract-generator.server");

    const { data: company } = await supabaseAdmin
      .from("tk_company_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!company) throw new Error("Vul eerst je firmagegevens in");

    const { data: employee, error: empErr } = await supabaseAdmin
      .from("tk_employees")
      .select("id, name")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (empErr || !employee) throw new Error("Medewerker niet gevonden");

    const { data: profile } = await supabaseAdmin
      .from("tk_employee_profiles")
      .select(
        "email, phone, street_address, postal_code, city, country, birth_date, weekly_hours, daily_schedule, employment_start_date, birth_place, national_number, iban, job_category, job_tasks, salary_advances, salary_settlement_day",
      )
      .eq("employee_id", employee.id)
      .maybeSingle();

    const body = buildContractBody(
      company as CompanySettings,
      {
        name: employee.name,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        street_address: profile?.street_address ?? null,
        postal_code: profile?.postal_code ?? null,
        city: profile?.city ?? null,
        country: profile?.country ?? null,
        birth_date: profile?.birth_date ?? null,
        birth_place: profile?.birth_place ?? null,
        national_number: data.national_number || profile?.national_number || null,
        iban: profile?.iban ?? null,
        job_category: profile?.job_category ?? null,
        job_tasks: profile?.job_tasks ?? null,
        salary_advances: profile?.salary_advances ?? null,
        salary_settlement_day: profile?.salary_settlement_day ?? 1,
      },
      {
        contractType: data.contract_type,
        jobTitle: data.job_title,
        workplace: data.workplace,
        startsOn: data.starts_on,
        endsOn: data.ends_on,
        weeklyHours: data.weekly_hours ?? profile?.weekly_hours ?? null,
        schedule: data.schedule,
        wageMode: data.wage_mode,
        wageAmount: data.wage_amount,
        jointCommittee: data.joint_committee,
        trialClause: data.trial_clause,
        noticeClause: data.notice_clause,
        extraClauses: data.extra_clauses,
        studentYearlyHours: data.student_yearly_hours,
        benefits: data.benefits,
      },
    );

    const { data: created, error } = await supabaseAdmin
      .from("tk_employment_contracts")
      .insert({
        employee_id: employee.id,
        contract_type: data.contract_type,
        status: "draft",
        job_title: data.job_title,
        workplace: data.workplace || null,
        starts_on: data.starts_on,
        ends_on: data.ends_on,
        weekly_hours: data.weekly_hours ?? profile?.weekly_hours ?? null,
        schedule: data.schedule || null,
        wage_mode: data.wage_mode,
        wage_amount: data.wage_amount,
        joint_committee: data.joint_committee || null,
        trial_clause: data.trial_clause || null,
        notice_clause: data.notice_clause || null,
        extra_clauses: data.extra_clauses || null,
        student_yearly_hours: data.student_yearly_hours,
        body,
        params: { national_number: data.national_number || null, benefits: data.benefits },
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error("Contract opslaan mislukt");

    // Dossier synchroniseren met het contract.
    const typeLabelMap: Record<string, string> = {
      indefinite: "Onbepaalde duur",
      fixed_term: "Bepaalde duur",
      student: "Jobstudent",
      self_employed: "Zelfstandige / bedrijfsleider",
    };
    await recordHoursChange(supabaseAdmin, employee.id, context.userId, profile,
      data.weekly_hours ?? profile?.weekly_hours ?? null, profile?.daily_schedule ?? null, data.starts_on);
    await supabaseAdmin.from("tk_employee_profiles").upsert(
      {
        employee_id: employee.id,
        job_title: data.job_title,
        contract_type: typeLabelMap[data.contract_type] ?? data.contract_type,
        employment_start_date: data.starts_on,
        weekly_hours: data.weekly_hours ?? profile?.weekly_hours ?? null,
        is_contractor: data.contract_type === "self_employed",
        ...(data.national_number ? { national_number: data.national_number } : {}),
        ...(data.joint_committee ? { joint_committee: data.joint_committee } : {}),
      },
      { onConflict: "employee_id" },
    );

    if (data.wage_amount != null) {
      await supabaseAdmin
        .from("tk_payroll_profiles")
        .update(
          data.wage_mode === "hourly"
            ? { wage_mode: "hourly", hourly_wage: data.wage_amount, weekly_hours: data.weekly_hours }
            : { wage_mode: "monthly", monthly_wage: data.wage_amount, weekly_hours: data.weekly_hours },
        )
        .eq("employee_id", employee.id);
    }

    return { ok: true, id: created.id, body };
  });

export const updateContractBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; body: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    const body = typeof data.body === "string" ? data.body.slice(0, 60000) : "";
    if (!body.trim()) throw new Error("De contracttekst is leeg");
    return { id: data.id, body };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("tk_employment_contracts")
      .update({ body: data.body })
      .eq("id", data.id)
      .in("status", ["draft", "awaiting_signature"])
      .is("employee_signed_at", null)
      .is("employer_signature_image", null)
      .select("id")
      .single();
    if (error) throw new Error("Bijwerken mislukt");
    return { ok: true };
  });

export const setContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: string; employer_name?: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    const status = text(data.status, 30);
    if (!["draft", "awaiting_signature", "signed", "archived"].includes(status)) {
      throw new Error("Ongeldige status");
    }
    return { id: data.id, status, employer_name: text(data.employer_name, 120) };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);
    const patch: {
      status: string;
      employer_signed_name?: string;
      employer_signed_at?: string;
    } = { status: data.status };
    const { error } = await supabaseAdmin.from("tk_employment_contracts").update(patch).eq("id", data.id);
    if (error) throw new Error("Status bijwerken mislukt");
    return { ok: true };
  });

export const signEmployerContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; fullName: string; signatureImage: string }) => {
    if (!data?.id) throw new Error("Kies een contract");
    const fullName = text(data.fullName, 120);
    if (fullName.length < 3) throw new Error("Vul je volledige naam in");
    return { id: data.id, fullName, signatureImage: validateDrawnSignature(data.signatureImage) };
  })
  .handler(async ({ data, context }) => {
    const { data: role, error: roleError } = await context.supabase.from("user_roles")
      .select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (roleError || !role) throw new Error("Geen admin-toegang");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: contract, error: readError } = await supabaseAdmin.from("tk_employment_contracts")
      .select("status, employer_signature_image, body").eq("id", data.id).maybeSingle();
    if (readError || !contract) throw new Error("Contract niet gevonden");
    if (!canEmployerSign(contract)) throw new Error("Dit contract is al door de zaakvoerder ondertekend of gearchiveerd");
    const { data: saved, error } = await supabaseAdmin.from("tk_employment_contracts")
      .update({ employer_signature_image: data.signatureImage, employer_signed_name: data.fullName, employer_signed_at: new Date().toISOString() })
      .eq("id", data.id).eq("body", contract.body).in("status", ["draft", "awaiting_signature", "signed"])
      .is("employer_signature_image", null).select("id").maybeSingle();
    if (error || !saved) throw new Error("Contract gewijzigd of al ondertekend; vernieuw en probeer opnieuw");
    return { ok: true };
  });

export const deleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("ID ontbreekt");
    return { id: data.id };
  })
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await ensureAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin.from("tk_employment_contracts").delete().eq("id", data.id);
    if (error) throw new Error("Verwijderen mislukt");
    return { ok: true };
  });
