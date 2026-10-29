import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginEmail } from "@/lib/login";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Alleen de beheerder kan dit doen");
}

/** Lists marketing logins (admin only). */
export const listMarketingUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "marketing");
    if (error) throw new Error(error.message);
    const users = await Promise.all((roles ?? []).map(async (r) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      const email = data.user?.email ?? "";
      return { id: r.user_id, login: email.endsWith("@ploeg.riory.local") ? email.replace("@ploeg.riory.local", "") : email };
    }));
    return users;
  });

/** Creates a login that can only manage marketing: newsletters, photos, customers. */
export const createMarketingLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ login: z.string().trim().min(1).max(100), password: z.string().min(6).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email: loginEmail(data.login), password: data.password, email_confirm: true });
    if (error || !created.user) throw new Error(error?.message?.includes("already") ? "Deze login bestaat al" : error?.message ?? "Account aanmaken mislukt");
    const { error: e1 } = await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "marketing" });
    if (e1) { await supabaseAdmin.auth.admin.deleteUser(created.user.id); throw new Error(e1.message); }
    return { ok: true };
  });

export const deleteMarketingLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.id);
    if (!roles?.length || roles.some((r) => r.role !== "marketing")) throw new Error("Dit is geen marketinglogin");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
