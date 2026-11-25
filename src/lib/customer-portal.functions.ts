import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !isAdmin) throw new Error("Alleen de beheerder heeft toegang tot deze actie.");
}

export const listCustomerPortalAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("customer_portal_accounts")
      .select("id, email, active, created_at, last_login_at, revoked_at")
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Portaalaccounts konden niet geladen worden.");
    return rows ?? [];
  });

export const grantCustomerPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ customerId: z.string().uuid(), email: z.string().trim().email().max(254) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { grantPortalAccess } = await import("./customer-portal.server");
    return grantPortalAccess(supabaseAdmin, data.customerId, data.email, context.userId);
  });

export const setCustomerPortalActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ accountId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("customer_portal_accounts")
      .update({ active: data.active, revoked_at: data.active ? null : new Date().toISOString() })
      .eq("id", data.accountId);
    if (error) throw new Error("Status wijzigen mislukt.");
    return { ok: true };
  });

/** Google sign-in hand-off: turns the Google session on this domain into a one-time portal login on www.riory.be. */
export const portalGoogleHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { portalLoginUrlForGoogleUser } = await import("./customer-portal.server");
    const url = await portalLoginUrlForGoogleUser(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: unknown })?.email,
    );
    return { url };
  });

/** Admin: history of contact details the customer changed themselves in the portal. */
export const listCustomerProfileChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("customer_profile_changes")
      .select("id, created_at, changed_by_email, source, changes")
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error("Wijzigingen konden niet geladen worden.");
    return (rows ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      by: r.changed_by_email,
      changes: (Array.isArray(r.changes) ? r.changes : []) as {
        field: string;
        before: string | null;
        after: string | null;
      }[],
    }));
  });
