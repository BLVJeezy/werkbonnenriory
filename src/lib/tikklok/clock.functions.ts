import { createServerFn } from "@tanstack/react-start";
import { compare } from "bcryptjs";
import { requireApprovedDevice } from "@/lib/tikklok/device-access.server";

// PIN-based public functions for the time clock terminal.
// PIN verification happens server-side using the admin client (bypasses RLS).

async function findEmployeeByPin(pin: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: employees, error } = await supabaseAdmin
    .from("tk_employees")
    .select("id, name, active, pin")
    .eq("active", true);
  if (error) throw new Error("Databasefout");
  let employee: (typeof employees)[number] | undefined;
  for (const candidate of employees ?? []) {
    if (await compare(pin, candidate.pin)) {
      employee = candidate;
      break;
    }
  }
  if (!employee) throw new Error("PIN niet herkend");
  return { employee, supabaseAdmin };
}

const pinValidator = (data: { pin: string; deviceToken: string }) => {
  if (!data || typeof data.pin !== "string") throw new Error("PIN ontbreekt");
  const pin = data.pin.trim();
  if (!/^\d{4,8}$/.test(pin)) throw new Error("Ongeldige PIN");
  const deviceToken = data.deviceToken?.trim();
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(deviceToken)) throw new Error("Dit toestel is niet goedgekeurd");
  return { pin, deviceToken };
};

export const clockIn = createServerFn({ method: "POST" })
  .inputValidator(pinValidator)
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);

    const { data: openEntry } = await supabaseAdmin
      .from("tk_time_entries")
      .select("id")
      .eq("employee_id", employee.id)
      .is("clock_out", null)
      .limit(1)
      .maybeSingle();

    if (openEntry) throw new Error(`${employee.name} is al ingetikt`);

    const { data: inserted, error } = await supabaseAdmin
      .from("tk_time_entries")
      .insert({ employee_id: employee.id })
      .select("clock_in")
      .single();
    if (error) throw new Error("Intikken mislukt");
    return { action: "in" as const, name: employee.name, time: inserted.clock_in };
  });

export const clockOut = createServerFn({ method: "POST" })
  .inputValidator(pinValidator)
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);

    const { data: openEntry } = await supabaseAdmin
      .from("tk_time_entries")
      .select("id, clock_in")
      .eq("employee_id", employee.id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openEntry) throw new Error(`${employee.name} is niet ingetikt`);

    const clockOutAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("tk_time_entries")
      .update({ clock_out: clockOutAt })
      .eq("id", openEntry.id);
    if (error) throw new Error("Uittikken mislukt");
    return {
      action: "out" as const,
      name: employee.name,
      time: clockOutAt,
      clockIn: openEntry.clock_in,
    };
  });

export const getMyHours = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string; deviceToken: string }) => {
    if (!data || typeof data.pin !== "string") throw new Error("PIN ontbreekt");
    const pin = data.pin.trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error("Ongeldige PIN");
    const deviceToken = data.deviceToken?.trim();
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(deviceToken)) throw new Error("Dit toestel is niet goedgekeurd");
    return { pin, deviceToken };
  })
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: entries, error } = await supabaseAdmin
      .from("tk_time_entries")
      .select("id, clock_in, clock_out")
      .eq("employee_id", employee.id)
      .gte("clock_in", since.toISOString())
      .order("clock_in", { ascending: false });

    if (error) throw new Error("Kon werktijden niet ophalen");

    return { name: employee.name, entries: entries ?? [] };
  });

function parseRequestISO(value: string, label: string) {
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new Error(`Ongeldige ${label}`);
  return d.toISOString();
}

export const submitTimeEntryRequest = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string; deviceToken: string; clock_in: string; clock_out: string; note?: string }) => {
    const base = pinValidator({ pin: data?.pin, deviceToken: data?.deviceToken });
    const clock_in = parseRequestISO(data.clock_in, "starttijd");
    const clock_out = parseRequestISO(data.clock_out, "eindtijd");
    const duration = new Date(clock_out).getTime() - new Date(clock_in).getTime();
    if (duration <= 0) throw new Error("Eindtijd moet na starttijd liggen");
    if (duration > 24 * 60 * 60 * 1000) throw new Error("Een aanvraag mag maximaal 24 uur duren");
    if (new Date(clock_in).getTime() > Date.now() + 60 * 60 * 1000) throw new Error("Starttijd mag niet in de toekomst liggen");
    const note = typeof data.note === "string" ? data.note.trim().slice(0, 500) : "";
    return { ...base, clock_in, clock_out, note: note || null };
  })
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);
    const { error } = await supabaseAdmin.from("tk_time_entry_requests").insert({
      employee_id: employee.id,
      clock_in: data.clock_in,
      clock_out: data.clock_out,
      note: data.note,
    });
    if (error) throw new Error("Aanvraag versturen mislukt");
    return { ok: true, name: employee.name };
  });

export const getMyRequests = createServerFn({ method: "POST" })
  .inputValidator(pinValidator)
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const { data: rows, error } = await supabaseAdmin
      .from("tk_time_entry_requests")
      .select("id, clock_in, clock_out, note, status, review_note, reviewed_at, created_at")
      .eq("employee_id", employee.id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error("Kon aanvragen niet ophalen");
    return { name: employee.name, requests: rows ?? [] };
  });

// ---- Berichten van de beheerder ----

export type EmployeeMessage = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  for_all: boolean;
};

async function fetchUnreadMessages(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  employeeId: string,
): Promise<EmployeeMessage[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: messages, error } = await supabaseAdmin
    .from("tk_employee_messages")
    .select("id, title, body, created_at, employee_id, expires_on")
    .eq("active", true)
    .or(`employee_id.eq.${employeeId},employee_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !messages?.length) return [];

  const valid = messages.filter((m) => !m.expires_on || m.expires_on >= today);
  if (!valid.length) return [];

  const { data: reads } = await supabaseAdmin
    .from("tk_employee_message_reads")
    .select("message_id")
    .eq("employee_id", employeeId)
    .in("message_id", valid.map((m) => m.id));
  const readIds = new Set((reads ?? []).map((r) => r.message_id));

  return valid
    .filter((m) => !readIds.has(m.id))
    .map((m) => ({
      id: m.id,
      title: m.title,
      body: m.body,
      created_at: m.created_at,
      for_all: m.employee_id == null,
    }));
}

export const getMyMessages = createServerFn({ method: "POST" })
  .inputValidator(pinValidator)
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);
    return { name: employee.name, messages: await fetchUnreadMessages(supabaseAdmin, employee.id) };
  });

export const acknowledgeMessages = createServerFn({ method: "POST" })
  .inputValidator((data: { pin: string; deviceToken: string; messageIds: string[] }) => {
    const base = pinValidator({ pin: data?.pin, deviceToken: data?.deviceToken });
    const messageIds = Array.isArray(data.messageIds)
      ? data.messageIds.filter((id) => typeof id === "string").slice(0, 50)
      : [];
    return { ...base, messageIds };
  })
  .handler(async ({ data }) => {
    await requireApprovedDevice(data.deviceToken);
    if (!data.messageIds.length) return { ok: true };
    const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);
    const { error } = await supabaseAdmin
      .from("tk_employee_message_reads")
      .upsert(
        data.messageIds.map((message_id) => ({ message_id, employee_id: employee.id })),
        { onConflict: "message_id,employee_id" },
      );
    if (error) throw new Error("Bericht bevestigen mislukt");
    return { ok: true };
  });
