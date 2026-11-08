import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { incidentSchema, type IncidentInput } from "./incident-rules";
import type { Tables } from "@/integrations/supabase/types";

export type IncidentRow = Tables<"tk_employee_incidents"> & { employee_name: string; read_at: string | null };

export const listIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { employee_id?: string }) => z.object({ employee_id: z.string().uuid().optional() }).parse(v))
  .handler(async ({ data, context }): Promise<IncidentRow[]> => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Geen admin-toegang");
    let query = context.supabase.from("tk_employee_incidents").select("*, employees:tk_employees(name)").order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
    if (data.employee_id) query = query.eq("employee_id", data.employee_id);
    const { data: rows, error } = await query;
    if (error) throw new Error("Vaststellingen laden mislukt");
    const ids = (rows ?? []).flatMap((r) => r.message_id ? [r.message_id] : []);
    const reads = ids.length ? await context.supabase.from("tk_employee_message_reads").select("message_id, employee_id, read_at").in("message_id", ids) : { data: [], error: null };
    if (reads.error) throw new Error("Leesstatus laden mislukt");
    return (rows ?? []).map(({ employees, ...row }) => ({ ...row, employee_name: employees?.name ?? "Medewerker", read_at: reads.data?.find((r) => r.message_id === row.message_id && r.employee_id === row.employee_id)?.read_at ?? null }));
  });

export const recordIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: IncidentInput) => incidentSchema.parse(v))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Geen admin-toegang");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("tk_employee_incidents").select("id").eq("id", data.id).maybeSingle();
    const { error } = await supabaseAdmin.rpc("tk_record_employee_incident", { p_id: data.id, p_employee: data.employee_id, p_type: data.incident_type, p_date: data.occurred_on, p_end: data.ends_on, p_minutes: data.late_minutes ?? 0, p_observation: data.observation, p_admin: context.userId, p_send: data.send });
    if (error) throw new Error("Vaststelling opslaan mislukt");
    if (data.incident_type === "no_show" && !existing) {
      const { data: profile } = await supabaseAdmin.from("tk_employee_profiles").select("weekly_hours, daily_schedule").eq("employee_id", data.employee_id).maybeSingle();
      const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
      const weekday = keys[new Date(`${data.occurred_on}T12:00:00Z`).getUTCDay()];
      const schedule = (profile?.daily_schedule ?? null) as Record<string, number> | null;
      const dayHours = schedule && typeof schedule[weekday] === "number" ? schedule[weekday] : profile?.weekly_hours != null ? Number(profile.weekly_hours) / 5 : 0;
      const minutes = Math.round(dayHours * 60);
      if (minutes > 0) {
        const monday = new Date(`${data.occurred_on}T12:00:00Z`);
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        const { error: adjError } = await supabaseAdmin.from("tk_overtime_adjustments").insert({
          employee_id: data.employee_id,
          source_week: monday.toISOString().slice(0, 10),
          adjustment_type: "recovered",
          minutes,
          note: `Niet opgedagen op ${data.occurred_on.split("-").reverse().join("/")}`,
          created_by: context.userId,
        });
        if (adjError) throw new Error("Vaststelling opgeslagen, maar overuren verrekenen mislukt");
      }
    }
    return { ok: true };
  });

export const sendIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: { id: string }) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Geen admin-toegang");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("tk_send_employee_incident", { p_id: data.id, p_admin: context.userId });
    if (error) throw new Error("Versturen mislukt");
    return { ok: true };
  });