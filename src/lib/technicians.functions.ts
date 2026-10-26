import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "Account aanmaken mislukt");
    const uid = created.user.id;
    const { error: e1 } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "technician" });
    const { error: e2 } = await supabaseAdmin
      .from("technicians")
      .insert({ name: data.name, phone: data.phone || null, email: data.email, user_id: uid });
    if (e1 || e2) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error((e1 ?? e2)!.message);
    }
    return { ok: true };
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
