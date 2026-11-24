import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  PORTAL_INVITE_TTL_HOURS,
  PORTAL_PASSWORD_MESSAGE,
  buildPortalAppointmentDescription,
  buildPortalInviteUrl,
  portalInvitationUsable,
} from "./customer-portal";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const INVALID_INVITE =
  "Deze uitnodigingslink is verlopen of al gebruikt. Vraag Riory om een nieuwe uitnodiging.";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomTokenHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

export const createCustomerPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ customerId: z.string().uuid(), email: z.string().trim().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const email = data.email.toLowerCase();

    const { data: customer, error: custErr } = await context.supabase
      .from("customers")
      .select("id, name")
      .eq("id", data.customerId)
      .single();
    if (custErr || !customer) throw new Error("Klant niet gevonden.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if an account already exists for this customer + email
    const { data: existing } = await supabaseAdmin
      .from("customer_portal_accounts")
      .select("id, user_id, active")
      .eq("customer_id", customer.id)
      .eq("email", email)
      .maybeSingle();

    let userId = existing?.user_id ?? null;
    if (!userId) {
      // Create a new auth user with a random unguessable initial password; the customer sets their own via the invite link.
      const tempPassword = `${randomTokenHex().slice(0, 24)}Aa1!`;
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { portal_customer_id: customer.id },
      });
      if (createErr || !created.user) {
        throw new Error(
          "Dit e-mailadres is al in gebruik bij een ander account. Gebruik een uniek klant-e-mailadres.",
        );
      }
      userId = created.user.id;
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "customer" });
      if (roleErr) throw new Error("Klantrol kon niet worden toegekend.");
    } else {
      // Safety guard: never allow inviting an internal admin/technician/marketing account.
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (roles?.some((r) => r.role !== "customer")) {
        throw new Error("Dit e-mailadres hoort bij een intern Riory-account.");
      }
    }

    let accountId = existing?.id ?? null;
    if (!accountId) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("customer_portal_accounts")
        .insert({
          customer_id: customer.id,
          user_id: userId,
          email,
          active: true,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw new Error("Portaalaccount aanmaken mislukt.");
      accountId = inserted.id;
    } else if (!existing?.active) {
      await supabaseAdmin
        .from("customer_portal_accounts")
        .update({ active: true, revoked_at: null })
        .eq("id", accountId);
    }

    const token = randomTokenHex();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + PORTAL_INVITE_TTL_HOURS * 3600 * 1000).toISOString();

    const { error: invErr } = await supabaseAdmin.from("customer_portal_invitations").insert({
      portal_account_id: accountId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: context.userId,
    });
    if (invErr) throw new Error("Uitnodigingslink kon niet worden opgeslagen.");

    return {
      accountId,
      email,
      expiresAt,
      inviteUrl: buildPortalInviteUrl(token),
    };
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

export const readCustomerPortalInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256Hex(data.token);
    const { data: inv, error } = await supabaseAdmin
      .from("customer_portal_invitations")
      .select("portal_account_id, expires_at, consumed_at")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !inv || !portalInvitationUsable(inv)) throw new Error(INVALID_INVITE);

    const { data: acc, error: accErr } = await supabaseAdmin
      .from("customer_portal_accounts")
      .select("email, active, customer_id, customers(name)")
      .eq("id", inv.portal_account_id)
      .single();
    if (accErr || !acc || !acc.active) throw new Error(INVALID_INVITE);
    const customerName =
      (acc.customers as { name?: string } | null)?.name ?? "Vaste klant";
    return { email: acc.email, customerName };
  });

export const acceptCustomerPortalInvite = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        password: z.string().min(8, PORTAL_PASSWORD_MESSAGE).max(72, PORTAL_PASSWORD_MESSAGE),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256Hex(data.token);
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("customer_portal_invitations")
      .select("portal_account_id, expires_at, consumed_at")
      .eq("token_hash", hash)
      .maybeSingle();
    if (invErr || !inv || !portalInvitationUsable(inv)) throw new Error(INVALID_INVITE);

    const { data: acc, error: accErr } = await supabaseAdmin
      .from("customer_portal_accounts")
      .select("id, user_id, email, active, customers(name)")
      .eq("id", inv.portal_account_id)
      .single();
    if (accErr || !acc || !acc.active || !acc.user_id) throw new Error(INVALID_INVITE);

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", acc.user_id);
    if (!roles?.length || roles.some((r) => r.role !== "customer")) throw new Error(INVALID_INVITE);

    const { data: claimed, error: claimErr } = await supabaseAdmin.rpc(
      "claim_customer_portal_invitation",
      { p_hash: hash },
    );
    if (claimErr || claimed !== acc.id) throw new Error(INVALID_INVITE);

    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(acc.user_id, {
      password: data.password,
    });
    if (pwErr) {
      await supabaseAdmin
        .from("customer_portal_invitations")
        .update({ consumed_at: null })
        .eq("token_hash", hash);
      throw new Error("Wachtwoord opslaan mislukt. Kies een sterker wachtwoord en probeer opnieuw.");
    }

    const customerName =
      (acc.customers as { name?: string } | null)?.name ?? "Vaste klant";
    return { email: acc.email, customerName };
  });

export const getPortalOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: account, error: accErr } = await context.supabase
      .from("customer_portal_accounts")
      .select("id, customer_id, email, active")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (accErr || !account) {
      throw new Error("Geen actieve klantenportaaltoegang gevonden voor dit account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("customer_portal_accounts")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", account.id);

    const [{ data: customer }, { data: workOrders }] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select("id, name, street, house_number, postal_code, city, phone, email, billing_email, vat_number, customer_number")
        .eq("id", account.customer_id)
        .single(),
      supabaseAdmin
        .from("work_orders")
        .select("id, number, status, scheduled_date, description, street, house_number, postal_code, city, site_street, site_house_number, site_postal_code, site_city, project_name, urgent, created_at, signed_at")
        .eq("customer_id", account.customer_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (!customer) throw new Error("Klantgegevens niet gevonden.");

    const woIds = (workOrders ?? []).map((w) => w.id);
    const [{ data: invByCustomer }, { data: invByWo }] = await Promise.all([
      supabaseAdmin
        .from("invoices")
        .select("id, number, issue_date, due_date, total, status, kind")
        .eq("customer->>id", account.customer_id)
        .neq("status", "draft")
        .order("issue_date", { ascending: false })
        .limit(50),
      woIds.length > 0
        ? supabaseAdmin
            .from("invoices")
            .select("id, number, issue_date, due_date, total, status, kind")
            .in("work_order_id", woIds)
            .neq("status", "draft")
            .order("issue_date", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as { id: string; number: string; issue_date: string; due_date: string; total: number; status: string; kind: string }[] }),
    ]);
    const seen = new Set<string>();
    const invoices = [...(invByCustomer ?? []), ...(invByWo ?? [])]
      .filter((inv) => {
        if (seen.has(inv.id)) return false;
        seen.add(inv.id);
        return true;
      })
      .sort((a, b) => (b.issue_date ?? "").localeCompare(a.issue_date ?? ""));

    return {
      accountEmail: account.email,
      customer,
      workOrders: workOrders ?? [],
      invoices,
    };
  });

export const submitPortalAppointmentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        description: z.string().trim().min(5, "Omschrijf kort het probleem of de gewenste werken.").max(2000),
        preferredWindow: z.string().trim().max(120).optional(),
        contactPhone: z.string().trim().max(40).optional(),
        urgent: z.boolean().optional(),
        worksiteDifferent: z.boolean().optional(),
        worksiteStreet: z.string().trim().max(120).optional(),
        worksiteHouseNumber: z.string().trim().max(20).optional(),
        worksitePostalCode: z.string().trim().max(20).optional(),
        worksiteCity: z.string().trim().max(80).optional(),
        projectName: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: account, error: accErr } = await context.supabase
      .from("customer_portal_accounts")
      .select("id, customer_id, email, active")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (accErr || !account) {
      throw new Error("Geen actieve klantenportaaltoegang gevonden.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer, error: custErr } = await supabaseAdmin
      .from("customers")
      .select("id, name, street, house_number, postal_code, city, phone, email, billing_email, default_vat_rate, branch_id")
      .eq("id", account.customer_id)
      .single();
    if (custErr || !customer) throw new Error("Klantgegevens niet gevonden.");

    const fullDescription = buildPortalAppointmentDescription({
      description: data.description,
      preferredWindow: data.preferredWindow,
      contactPhone: data.contactPhone,
      urgent: data.urgent,
    });

    const { data: created, error: insErr } = await supabaseAdmin
      .from("work_orders")
      .insert({
        customer_id: customer.id,
        customer_name: customer.name,
        email: customer.email ?? account.email,
        billing_email: customer.billing_email ?? customer.email ?? account.email,
        phone: data.contactPhone?.trim() || customer.phone,
        street: customer.street,
        house_number: customer.house_number,
        postal_code: customer.postal_code,
        city: customer.city,
        site_street: data.worksiteDifferent ? data.worksiteStreet || null : null,
        site_house_number: data.worksiteDifferent ? data.worksiteHouseNumber || null : null,
        site_postal_code: data.worksiteDifferent ? data.worksitePostalCode || null : null,
        site_city: data.worksiteDifferent ? data.worksiteCity || null : null,
        project_name: data.projectName?.trim() || null,
        description: fullDescription,
        status: "open",
        scheduled_date: null,
        urgent: !!data.urgent,
        vat_rate: customer.default_vat_rate ?? 21,
        branch_id: customer.branch_id,
        received_at: new Date().toISOString(),
      })
      .select("id, created_at")
      .single();

    if (insErr || !created) {
      throw new Error("Afspraakaanvraag kon niet worden opgeslagen. Probeer opnieuw.");
    }
    return { id: created.id, createdAt: created.created_at };
  });