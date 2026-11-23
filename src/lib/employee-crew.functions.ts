import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginEmail } from "@/lib/login";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Alleen de beheerder kan dit doen");
}

export const createEmployeeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp, error: empErr } = await supabaseAdmin
      .from("tk_employees")
      .select("id, name, user_id, active")
      .eq("id", data.employeeId)
      .single();
    if (empErr || !emp) throw new Error("Medewerker niet gevonden");
    if (!emp.active) throw new Error("Medewerker is niet actief");
    if (emp.user_id) throw new Error("Deze medewerker heeft al een login");

    const email = loginEmail(emp.name);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      email_confirm: true,
    });
    if (error || !created.user) {
      throw new Error(error?.message?.includes("already") ? `Er bestaat al een login met naam ${emp.name}` : error?.message ?? "Account aanmaken mislukt");
    }
    const uid = created.user.id;
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "technician" });
    const { error: updErr } = await supabaseAdmin.from("tk_employees").update({ user_id: uid }).eq("id", emp.id);
    if (roleErr || updErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(roleErr?.message ?? updErr?.message ?? "Login koppelen mislukt");
    }
    const { issueEmployeeInvitation } = await import("./crew-invitation.server");
    return { ok: true, name: emp.name, ...(await issueEmployeeInvitation(supabaseAdmin, emp.id)) };
  });

export const createAllEmployeeLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: employees, error } = await supabaseAdmin
      .from("tk_employees")
      .select("id, name, user_id")
      .eq("active", true)
      .is("user_id", null)
      .order("name");
    if (error) throw new Error(error.message);

    const createdNames: string[] = [];
    const skipped: string[] = [];
    for (const emp of employees ?? []) {
      const email = loginEmail(emp.name);
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        email_confirm: true,
      });
      if (cErr || !created.user) {
        skipped.push(emp.name);
        continue;
      }
      const uid = created.user.id;
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "technician" });
      const { error: uErr } = await supabaseAdmin.from("tk_employees").update({ user_id: uid }).eq("id", emp.id);
      if (rErr || uErr) {
        await supabaseAdmin.auth.admin.deleteUser(uid);
        skipped.push(emp.name);
        continue;
      }
      createdNames.push(emp.name);
    }
    return { created: createdNames, skipped };
  });

export const inviteEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employeeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp, error } = await supabaseAdmin
      .from("tk_employees")
      .select("id, name, user_id, active")
      .eq("id", data.employeeId)
      .single();
    if (error || !emp?.user_id || !emp.active) throw new Error("Deze medewerker heeft geen actieve login");
    const { issueEmployeeInvitation } = await import("./crew-invitation.server");
    return { name: emp.name, ...(await issueEmployeeInvitation(supabaseAdmin, emp.id)) };
  });

export const assignEmployeeToCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        technicianId: z.string().uuid().nullable(),
        note: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: emp, error: empErr } = await context.supabase
      .from("tk_employees")
      .select("id, current_technician_id")
      .eq("id", data.employeeId)
      .single();
    if (empErr || !emp) throw new Error("Medewerker niet gevonden");
    if (emp.current_technician_id === data.technicianId) return { ok: true, changed: false };

    const now = new Date().toISOString();
    const { error: closeErr } = await context.supabase
      .from("tk_employee_crew_assignments")
      .update({ ended_at: now })
      .eq("employee_id", data.employeeId)
      .is("ended_at", null);
    if (closeErr) throw new Error(closeErr.message);

    if (data.technicianId) {
      const { error: insErr } = await context.supabase.from("tk_employee_crew_assignments").insert({
        employee_id: data.employeeId,
        technician_id: data.technicianId,
        started_at: now,
        assigned_by: context.userId,
        note: data.note || null,
      });
      if (insErr) throw new Error(insErr.message);
    }

    const { error: updErr } = await context.supabase
      .from("tk_employees")
      .update({ current_technician_id: data.technicianId })
      .eq("id", data.employeeId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, changed: true };
  });