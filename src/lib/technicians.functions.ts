import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginEmail } from "@/lib/login";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Alleen de beheerder kan dit doen");
}

export const createTechnicianLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(100),
        phone: z.string().trim().max(40).optional(),
        password: z.string().min(6).max(72).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = loginEmail(data.name);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password ?? `${crypto.randomUUID()}${crypto.randomUUID()}`,
      email_confirm: true,
    });
    if (error || !created.user)
      throw new Error(error?.message?.includes("already") ? "Er bestaat al een ploeg met deze naam" : error?.message ?? "Account aanmaken mislukt");
    const uid = created.user.id;
    const { error: e1 } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "technician" });
    const { error: e2 } = await supabaseAdmin
      .from("technicians")
      .insert({ name: data.name, phone: data.phone || null, email: null, user_id: uid }).select("id").single();
    if (e1 || e2) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(e1?.message ?? e2?.message ?? "Ploeg aanmaken mislukt");
    }
    const { data: crew, error: crewError } = await supabaseAdmin.from("technicians").select("id").eq("user_id", uid).single();
    if (crewError || !crew) throw new Error("Ploeg aangemaakt; open de uitnodiging opnieuw vanuit de lijst.");
    const { issueCrewInvitation } = await import("./crew-invitation.server");
    return { ok: true, ...await issueCrewInvitation(supabaseAdmin, crew.id) };
  });

export const deleteTechnician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin.from("technicians").select("user_id").eq("id", data.id).single();
    await supabaseAdmin.from("work_orders").update({ technician_id: null }).eq("technician_id", data.id).neq("status", "afgetekend");
    const { error } = await supabaseAdmin.from("technicians").delete().eq("id", data.id);
    if (error) throw new Error("Technieker heeft afgetekende werkbonnen en kan niet verwijderd worden");
    if (t?.user_id) await supabaseAdmin.auth.admin.deleteUser(t.user_id);
    return { ok: true };
  });
