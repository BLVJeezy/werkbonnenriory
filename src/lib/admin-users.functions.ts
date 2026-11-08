import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminAccountSchema, adminInvitationUrl, assertAccountAdmin, persistAdminRole } from "./admin-accounts";

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccountAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles, error } = await context.supabase.from("user_roles").select("user_id").eq("role", "admin");
    // Ordinary role RLS may expose only the caller's role; privileged listing follows the admin check.
    if (error) throw new Error("Beheerders ophalen mislukt.");
    const { data: allRoles, error: allError } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    if (allError) throw new Error("Beheerders ophalen mislukt.");
    return Promise.all((allRoles ?? roles ?? []).map(async (r) => {
      const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      if (userError || !data.user) throw new Error("Beheerdergegevens ophalen mislukt.");
      return { id: r.user_id, email: data.user.email ?? "", active: Boolean(data.user.last_sign_in_at), self: r.user_id === context.userId };
    }));
  });

export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminAccountSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAccountAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId: string;
    let setupUrl: string | null = null;
    if (data.mode === "invite") {
      const { data: invitation, error } = await supabaseAdmin.auth.admin.generateLink({ type: "invite", email: data.email });
      if (error || !invitation.user || !invitation.properties?.hashed_token) throw new Error(error?.message?.includes("already") ? "Dit e-mailadres heeft al een account. Gebruik de uitnodigingsknop bij een bestaande beheerder." : error?.message ?? "Uitnodiging aanmaken mislukt.");
      userId = invitation.user.id;
      try { setupUrl = adminInvitationUrl(invitation.properties.hashed_token, "invite"); }
      catch (error) { await supabaseAdmin.auth.admin.deleteUser(userId); throw error; }
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true });
      if (error || !created.user) throw new Error(error?.message?.includes("already") ? "Dit e-mailadres heeft al een account." : error?.message ?? "Beheerder aanmaken mislukt.");
      userId = created.user.id;
    }
    await persistAdminRole(userId, (role) => supabaseAdmin.from("user_roles").insert(role), (id) => supabaseAdmin.auth.admin.deleteUser(id));
    return { ok: true, setupUrl, email: data.email };
  });

export const inviteExistingAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAccountAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("user_id", data.id).eq("role", "admin").maybeSingle();
    if (error || !role) throw new Error("Dit account is geen beheerder.");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(data.id);
    if (!user.user?.email) throw new Error("Geen e-mailadres gevonden.");
    const { data: invitation, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email: user.user.email });
    if (linkError || !invitation.properties?.hashed_token) throw new Error("Uitnodigingslink aanmaken mislukt.");
    return { email: user.user.email, setupUrl: adminInvitationUrl(invitation.properties.hashed_token, "recovery") };
  });