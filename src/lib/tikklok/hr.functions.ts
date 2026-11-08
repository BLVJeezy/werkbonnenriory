import { createServerFn } from "@tanstack/react-start";
import { compare } from "bcryptjs";
import { requireApprovedDevice } from "@/lib/tikklok/device-access.server";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export const EMPLOYEE_DOCUMENT_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "id_card", label: "Identiteitskaart" },
  { value: "passport", label: "Paspoort" },
  { value: "drivers_license", label: "Rijbewijs" },
  { value: "diploma", label: "Diploma" },
  { value: "medical", label: "Medisch attest" },
  { value: "sick_note", label: "Ziektebriefje" },
  { value: "other", label: "Overig" },
] as const;

const UPLOADABLE_TYPES = new Set(EMPLOYEE_DOCUMENT_TYPES.map((t) => t.value));

const pinValidator = (data: { pin: string; deviceToken: string }) => {
  const pin = (data?.pin ?? "").trim();
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Ongeldige PIN");
  const deviceToken = (data?.deviceToken ?? "").trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(deviceToken)) throw new Error("Dit toestel is niet goedgekeurd");
  return { pin, deviceToken };
};

/** Verifies the PIN and makes sure the person is a payrolled employee (no contractor). */
async function requireStaffEmployee(pin: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: employees, error } = await supabaseAdmin
    .from("tk_employees")
    .select("id, name, pin")
    .eq("active", true);
  if (error) throw new Error("Databasefout");
  let employee: { id: string; name: string } | undefined;
  for (const candidate of employees ?? []) {
    if (await compare(pin, candidate.pin)) {
      employee = { id: candidate.id, name: candidate.name };
      break;
    }
  }
  if (!employee) throw new Error("PIN niet herkend");

  const { data: profile } = await supabaseAdmin
    .from("tk_employee_profiles")
    .select(
      "is_contractor, job_title, department, contract_type, employment_start_date, weekly_hours, daily_schedule, overtime_calculation_mode, employment_status, email, phone",
    )
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (profile?.is_contractor) {
    throw new Error("Het personeelsdossier is enkel beschikbaar voor vaste medewerkers, niet voor onderaanneming.");
  }

  return { employee, profile, supabaseAdmin };
}

export const getMyHrFile = createServerFn({ method: "POST" })
  .inputValidator(pinValidator)
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, profile, supabaseAdmin } = await requireStaffEmployee(data.pin);

    const { data: docs, error } = await supabaseAdmin
      .from("tk_employee_documents")
      .select("id, title, document_type, file_name, mime_type, file_size, expires_on, storage_path, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Kon documenten niet ophalen");

    const documents = await Promise.all(
      (docs ?? []).map(async (doc) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("tikklok-documents")
          .createSignedUrl(doc.storage_path, 300);
        const { storage_path: _omit, ...rest } = doc;
        return { ...rest, url: signed?.signedUrl ?? null };
      }),
    );

    const { data: contracts } = await supabaseAdmin
      .from("tk_employment_contracts")
      .select(
        "id, contract_type, status, job_title, starts_on, ends_on, body, employer_signed_name, employer_signed_at, employer_signature_image, employee_signed_name, employee_signed_at, employee_signature_image, created_at",
      )
      .eq("employee_id", employee.id)
      .in("status", ["awaiting_signature", "signed"])
      .order("created_at", { ascending: false });

    return {
      name: employee.name,
      contracts: contracts ?? [],
      profile: profile
        ? {
            job_title: profile.job_title,
            department: profile.department,
            contract_type: profile.contract_type,
            employment_start_date: profile.employment_start_date,
            weekly_hours: profile.weekly_hours,
            employment_status: profile.employment_status,
            email: profile.email,
            phone: profile.phone,
          }
        : null,
      documents,
    };
  });

export const uploadMyDocument = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      pin: string;
      deviceToken: string;
      documentType: string;
      title: string;
      fileName: string;
      mimeType: string;
      contentBase64: string;
      expiresOn?: string | null;
    }) => {
      const base = pinValidator(data);
      const documentType = (data.documentType ?? "other").trim();
      if (!UPLOADABLE_TYPES.has(documentType as never)) throw new Error("Ongeldig documenttype");
      const title = (data.title ?? "").trim().slice(0, 150);
      const fileName = (data.fileName ?? "").trim().slice(0, 200);
      if (!title || !fileName) throw new Error("Titel en bestandsnaam zijn verplicht");
      const contentBase64 = (data.contentBase64 ?? "").replace(/^data:[^;]+;base64,/, "");
      if (!contentBase64) throw new Error("Bestand ontbreekt");
      if (contentBase64.length * 0.75 > MAX_FILE_BYTES) throw new Error("Bestand is groter dan 8 MB");
      const expiresOn = data.expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(data.expiresOn) ? data.expiresOn : null;
      return {
        ...base,
        documentType,
        title,
        fileName,
        mimeType: (data.mimeType || "application/octet-stream").slice(0, 120),
        contentBase64,
        expiresOn,
      };
    },
  )
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await requireStaffEmployee(data.pin);

    const bytes = Buffer.from(data.contentBase64, "base64");
    if (bytes.byteLength === 0) throw new Error("Bestand is leeg");
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("Bestand is groter dan 8 MB");

    const safeName = data.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${employee.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("tikklok-documents")
      .upload(path, bytes, { contentType: data.mimeType, upsert: false });
    if (uploadError) throw new Error("Uploaden mislukt");

    const { error } = await supabaseAdmin.from("tk_employee_documents").insert({
      employee_id: employee.id,
      title: data.title,
      document_type: data.documentType,
      storage_path: path,
      file_name: data.fileName,
      mime_type: data.mimeType,
      file_size: bytes.byteLength,
      expires_on: data.expiresOn,
    });
    if (error) {
      await supabaseAdmin.storage.from("tikklok-documents").remove([path]);
      throw new Error("Document registreren mislukt");
    }

    return { ok: true, name: employee.name };
  });

// ---------------------------------------------------------------------------
// Overuren & vakantie-aanvragen (enkel vast personeel)
// ---------------------------------------------------------------------------

export const LEAVE_REQUEST_TYPES = [
  { value: "vacation", label: "Vakantie" },
  { value: "overtime_recovery", label: "Recuperatie overuren" },
  { value: "unpaid", label: "Onbetaald verlof" },
] as const;

const LEAVE_TYPES = new Set(LEAVE_REQUEST_TYPES.map((t) => t.value));
const LOOKBACK_WEEKS = 26;

const BRUSSELS_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Monday (yyyy-mm-dd) of the Brussels week the instant falls in. */
function weekStartKey(instant: string) {
  const dayKey = BRUSSELS_DATE.format(new Date(instant));
  const [y = 0, m = 0, d = 1] = dayKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const shift = (utc.getUTCDay() + 6) % 7; // 0 = Monday
  utc.setUTCDate(utc.getUTCDate() - shift);
  return utc.toISOString().slice(0, 10);
}

type OvertimeSummary = {
  weeklyHours: number | null;
  startDate: string | null;
  measurementStart: string | null;
  measurementEnd: string | null;
  registeredWorkdays: number;
  totalWorkedMinutes: number;
  totalExpectedMinutes: number;
  deficitMinutes: number;
  balanceMinutes: number;
  overtimeMinutes: number;
  extraMinutes: number;
  recoveredMinutes: number;
  paidMinutes: number;
  usesPersonalSchedule: boolean;
  calculationMode: "daily" | "weekly";
  weeks: {
    weekStart: string;
    workedMinutes: number;
    expectedMinutes: number;
    diffMinutes: number;
    surplusMinutes: number;
    deficitMinutes: number;
    registeredWorkdays: number;
    isCurrentWeek: boolean;
    extraMinutes: number;
    recoveredMinutes: number;
    paidMinutes: number;
    openMinutes: number;
    days: {
      date: string;
      workedMinutes: number;
      expectedMinutes: number;
      diffMinutes: number;
    }[];
  }[];
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type DailySchedule = Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", number>;

const SCHEDULE_KEYS: (keyof DailySchedule)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function normalizeSchedule(value: unknown, weeklyHours: number | null): { schedule: DailySchedule; personal: boolean } {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const valid = raw && SCHEDULE_KEYS.every((key) => Number.isFinite(Number(raw[key])) && Number(raw[key]) >= 0);
  if (valid) {
    return {
      schedule: Object.fromEntries(SCHEDULE_KEYS.map((key) => [key, Number(raw[key])])) as DailySchedule,
      personal: true,
    };
  }
  const weekdayHours = (weeklyHours ?? 0) / 5;
  return { schedule: { mon: weekdayHours, tue: weekdayHours, wed: weekdayHours, thu: weekdayHours, fri: weekdayHours, sat: 0, sun: 0 }, personal: false };
}

export async function buildOvertime(
  supabaseAdmin: any,
  employeeId: string,
  weeklyHours: number | null,
  startDate: string | null = null,
  dailySchedule: unknown = null,
  calculationMode: "daily" | "weekly" = "daily",
  allWeeks = false,
): Promise<OvertimeSummary> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_WEEKS * 7);

  // Never include registrations from before the employee's official start date.
  // Use a Brussels-local midnight expressed as UTC; this also prevents an older
  // registration in the same calendar week from leaking into the first week.
  const startBoundary = startDate ? new Date(`${startDate}T00:00:00+02:00`) : null;
  const queryFrom =
    startBoundary && startBoundary.getTime() > since.getTime()
      ? startBoundary.toISOString()
      : since.toISOString();

  const { data: entries } = await supabaseAdmin
    .from("tk_time_entries")
    .select("clock_in, clock_out")
    .eq("employee_id", employeeId)
    .gte("clock_in", queryFrom)
    .not("clock_out", "is", null);

  const perWeek = new Map<string, { minutes: number; workdays: Set<string>; perDay: Map<string, number> }>();
  for (const entry of entries ?? []) {
    const minutes = Math.max(
      0,
      Math.round((new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 60_000),
    );
    const key = weekStartKey(entry.clock_in);
    const existing = perWeek.get(key) ?? { minutes: 0, workdays: new Set<string>(), perDay: new Map<string, number>() };
    const dayKey = BRUSSELS_DATE.format(new Date(entry.clock_in));
    existing.minutes += minutes;
    existing.workdays.add(dayKey);
    existing.perDay.set(dayKey, (existing.perDay.get(dayKey) ?? 0) + minutes);
    perWeek.set(key, existing);
  }

  const currentWeek = weekStartKey(new Date().toISOString());
  const expectedMinutes = weeklyHours != null ? Math.round(weeklyHours * 60) : null;
  const { schedule, personal: usesPersonalSchedule } = normalizeSchedule(dailySchedule, weeklyHours);

  // Contract hours can change over time. For each week, use the hours regime
  // that was in effect then (latest change effective in or before that week),
  // so old weeks keep counting with the old contract hours.
  type HoursRegime = { weeklyHours: number | null; dailySchedule: unknown; expectedMinutes: number | null; schedule: DailySchedule };
  const { data: hoursHistory } = await supabaseAdmin
    .from("tk_employee_hours_history")
    .select("weekly_hours, daily_schedule, effective_from")
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: true });
  const regimes: { effectiveFrom: string; regime: HoursRegime }[] = (hoursHistory ?? []).map((row: any) => {
    const hours = row.weekly_hours == null ? null : Number(row.weekly_hours);
    return {
      effectiveFrom: String(row.effective_from),
      regime: {
        weeklyHours: hours,
        dailySchedule: row.daily_schedule,
        expectedMinutes: hours != null ? Math.round(hours * 60) : null,
        schedule: normalizeSchedule(row.daily_schedule, hours).schedule,
      },
    };
  });
  const currentRegime: HoursRegime = { weeklyHours, dailySchedule, expectedMinutes, schedule };
  const regimeForWeek = (weekStart: string): HoursRegime => {
    const weekEnd = addDays(weekStart, 6);
    let applicable = currentRegime;
    for (const entry of regimes) {
      if (entry.effectiveFrom <= weekEnd) applicable = entry.regime;
      else break;
    }
    return applicable;
  };

  const { data: adjustments } = await supabaseAdmin
    .from("tk_overtime_adjustments")
    .select("source_week, adjustment_type, minutes")
    .eq("employee_id", employeeId);

  const adjustedByWeek = new Map<string, { extra: number; recovered: number; paid: number }>();
  for (const adjustment of adjustments ?? []) {
    const key = String(adjustment.source_week);
    const current = adjustedByWeek.get(key) ?? { extra: 0, recovered: 0, paid: 0 };
    if (adjustment.adjustment_type === "paid") current.paid += Number(adjustment.minutes);
    else if (adjustment.adjustment_type === "extra") current.extra += Number(adjustment.minutes);
    else current.recovered += Number(adjustment.minutes);
    adjustedByWeek.set(key, current);
  }

  const weeks = [...perWeek.entries()]
    .filter(([weekStart]) => !startDate || addDays(weekStart, 6) >= startDate)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([weekStart, registration]) => {
      const regime = regimeForWeek(weekStart);
      const days = SCHEDULE_KEYS.map((day, index) => {
        const date = addDays(weekStart, index);
        const worked = registration.perDay.get(date) ?? 0;
        const expected = regime.expectedMinutes == null || (startDate && date < startDate) ? 0 : Math.round(regime.schedule[day] * 60);
        return {
          date,
          workedMinutes: worked,
          expectedMinutes: expected,
          diffMinutes: regime.expectedMinutes == null || calculationMode === "weekly" ? 0 : worked - expected,
        };
      });
      const expected = regime.expectedMinutes == null ? null : days.reduce((sum, day) => sum + day.expectedMinutes, 0);
      const adjusted = adjustedByWeek.get(weekStart) ?? { extra: 0, recovered: 0, paid: 0 };
      const diff = expected == null ? 0 : registration.minutes - expected;
      // Only a surplus is built-up overtime. A week with fewer hours than the
      // contract is reported as information but never reduces the balance:
      // already earned overtime cannot be cancelled out by a short week.
      const surplus = Math.max(0, diff);
      return {
        weekStart,
        workedMinutes: registration.minutes,
        expectedMinutes: expected ?? 0,
        diffMinutes: diff,
        surplusMinutes: surplus,
        deficitMinutes: Math.max(0, -diff),
        registeredWorkdays: registration.workdays.size,
        isCurrentWeek: weekStart === currentWeek,
        extraMinutes: adjusted.extra,
        recoveredMinutes: adjusted.recovered,
        paidMinutes: adjusted.paid,
        openMinutes: Math.max(0, surplus + adjusted.extra - adjusted.recovered - adjusted.paid),
        days,
      };
    });

  const closedWeeks = weeks.filter((week) => !week.isCurrentWeek);
  // With a variable weekly schedule, already-earned overtime in the current
  // week is certain once the weekly target is reached. Include that surplus,
  // but never turn an unfinished week into a negative balance.
  const currentEarnedWeek =
    calculationMode === "weekly"
      ? weeks.find((week) => week.isCurrentWeek && week.diffMinutes > 0) ?? null
      : null;
  const balanceWeeks = currentEarnedWeek ? [...closedWeeks, currentEarnedWeek] : closedWeeks;
  const chronologicalClosedWeeks = [...closedWeeks].sort((a, b) => (a.weekStart > b.weekStart ? 1 : -1));
  const measurementStart = chronologicalClosedWeeks[0]?.weekStart ?? null;
  const lastClosedWeek = chronologicalClosedWeeks.at(-1);
  const measurementEnd = lastClosedWeek ? addDays(lastClosedWeek.weekStart, 6) : null;
  const totalWorkedMinutes = balanceWeeks.reduce((sum, week) => sum + week.workedMinutes, 0);
  const totalExpectedMinutes = balanceWeeks.reduce((sum, week) => sum + week.expectedMinutes, 0);
  const registeredWorkdays = balanceWeeks.reduce((sum, week) => sum + week.registeredWorkdays, 0);

  const extraMinutes = (adjustments ?? [])
    .filter((item: any) => item.adjustment_type === "extra")
    .reduce((sum: number, item: any) => sum + Number(item.minutes), 0);
  const deficitMinutes = balanceWeeks.reduce((sum, week) => sum + week.deficitMinutes, 0);
  const overtimeMinutes =
    expectedMinutes == null
      ? extraMinutes
      : balanceWeeks.reduce((sum, week) => sum + week.surplusMinutes, 0) + extraMinutes;

  const recoveredMinutes = (adjustments ?? [])
    .filter((item: any) => item.adjustment_type === "recovered")
    .reduce((sum: number, item: any) => sum + Number(item.minutes), 0);
  const paidMinutes = (adjustments ?? [])
    .filter((item: any) => item.adjustment_type === "paid")
    .reduce((sum: number, item: any) => sum + Number(item.minutes), 0);

  return {
    weeklyHours,
    startDate,
    measurementStart,
    measurementEnd,
    registeredWorkdays,
    totalWorkedMinutes,
    totalExpectedMinutes,
    deficitMinutes,
    balanceMinutes: Math.max(0, overtimeMinutes - recoveredMinutes - paidMinutes),
    overtimeMinutes,
    extraMinutes,
    recoveredMinutes,
    paidMinutes,
    usesPersonalSchedule,
    calculationMode,
    weeks: allWeeks ? weeks : weeks.slice(0, 12),
  };
}

export const getMyOvertime = createServerFn({ method: "POST" })
  .inputValidator(pinValidator)
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, profile, supabaseAdmin } = await requireStaffEmployee(data.pin);
    const overtime = await buildOvertime(
      supabaseAdmin,
      employee.id,
      profile?.weekly_hours ?? null,
      profile?.employment_start_date ?? null,
      profile?.daily_schedule ?? null,
      profile?.overtime_calculation_mode === "weekly" ? "weekly" : "daily",
    );

    const { data: requests } = await supabaseAdmin
      .from("tk_leave_requests")
      .select("id, request_type, starts_on, ends_on, hours, note, status, review_note, reviewed_at, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return { name: employee.name, overtime, requests: requests ?? [] };
  });

export const submitLeaveRequest = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      pin: string;
      deviceToken: string;
      requestType: string;
      startsOn: string;
      endsOn: string;
      hours?: number | string | null;
      note?: string;
    }) => {
      const base = pinValidator(data);
      const requestType = (data.requestType ?? "vacation").trim();
      if (!LEAVE_TYPES.has(requestType as never)) throw new Error("Ongeldig type aanvraag");
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(data.startsOn ?? "")) throw new Error("Ongeldige begindatum");
      if (!dateRe.test(data.endsOn ?? "")) throw new Error("Ongeldige einddatum");
      if (data.endsOn < data.startsOn) throw new Error("Einddatum moet na de begindatum liggen");
      let hours: number | null = null;
      if (requestType === "overtime_recovery") {
        const parsed = Number(String(data.hours ?? "").replace(",", "."));
        if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Geef het aantal uren recuperatie in");
        if (parsed > 200) throw new Error("Maximaal 200 uren per aanvraag");
        hours = Math.round(parsed * 100) / 100;
      }
      const note = typeof data.note === "string" ? data.note.trim().slice(0, 500) : "";
      return { ...base, requestType, startsOn: data.startsOn, endsOn: data.endsOn, hours, note: note || null };
    },
  )
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, profile, supabaseAdmin } = await requireStaffEmployee(data.pin);

    if (data.requestType === "overtime_recovery") {
      const overtime = await buildOvertime(
        supabaseAdmin,
        employee.id,
        profile?.weekly_hours ?? null,
        profile?.employment_start_date ?? null,
        profile?.daily_schedule ?? null,
        profile?.overtime_calculation_mode === "weekly" ? "weekly" : "daily",
      );
      if (overtime.balanceMinutes < Math.round((data.hours ?? 0) * 60)) {
        throw new Error("Je hebt niet genoeg overuren openstaan voor deze aanvraag");
      }
    }

    const { error } = await supabaseAdmin.from("tk_leave_requests").insert({
      employee_id: employee.id,
      request_type: data.requestType,
      starts_on: data.startsOn,
      ends_on: data.endsOn,
      hours: data.hours,
      note: data.note,
    });
    if (error) throw new Error("Aanvraag versturen mislukt");
    return { ok: true, name: employee.name };
  });

export const cancelMyLeaveRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string; deviceToken: string; id: string }) => {
    const base = pinValidator(data);
    if (!data?.id) throw new Error("ID ontbreekt");
    return { ...base, id: data.id };
  })
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await requireStaffEmployee(data.pin);
    const { error } = await supabaseAdmin
      .from("tk_leave_requests")
      .delete()
      .eq("id", data.id)
      .eq("employee_id", employee.id)
      .eq("status", "pending");
    if (error) throw new Error("Intrekken mislukt");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Contract digitaal ondertekenen (werknemer, via de tikklok)
// ---------------------------------------------------------------------------

export const signMyContract = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string; deviceToken: string; id: string; fullName: string; signatureImage: string }) => {
    const base = pinValidator(data);
    const signatureImage = String(data?.signatureImage ?? "");
    if (!signatureImage.startsWith("data:image/png;base64,") || signatureImage.length < 200) throw new Error("Teken eerst je handtekening");
    if (signatureImage.length > 400_000) throw new Error("Handtekening is te groot");
    if (!data?.id) throw new Error("ID ontbreekt");
    const fullName = (data.fullName ?? "").trim().slice(0, 120);
    if (fullName.length < 3) throw new Error("Typ je volledige naam om te ondertekenen");
    return { ...base, id: data.id, fullName, signatureImage };
  })
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await requireStaffEmployee(data.pin);

    const { data: contract } = await supabaseAdmin
      .from("tk_employment_contracts")
      .select("id, status")
      .eq("id", data.id)
      .eq("employee_id", employee.id)
      .maybeSingle();
    if (!contract) throw new Error("Contract niet gevonden");
    if (contract.status !== "awaiting_signature") throw new Error("Dit contract kan niet (meer) ondertekend worden");

    const { error } = await supabaseAdmin
      .from("tk_employment_contracts")
      .update({
        status: "signed",
        employee_signed_name: data.fullName,
        employee_signature_image: data.signatureImage,
        employee_signed_at: new Date().toISOString(),
        employee_signed_device: data.deviceToken.slice(0, 12),
      })
      .eq("id", contract.id);
    if (error) throw new Error("Ondertekenen mislukt");
    return { ok: true };
  });

export const getMyPendingContracts = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string; deviceToken: string }) => pinValidator(data))
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await requireStaffEmployee(data.pin);
    const { data: rows } = await supabaseAdmin
      .from("tk_employment_contracts")
      .select("id, contract_type, body, employer_signed_name, employer_signed_at, employer_signature_image")
      .eq("employee_id", employee.id)
      .eq("status", "awaiting_signature")
      .order("created_at", { ascending: true });
    return { name: employee.name as string, contracts: rows ?? [] };
  });
