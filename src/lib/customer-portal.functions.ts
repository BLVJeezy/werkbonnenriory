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
    const customerName = (acc.customers as { name?: string } | null)?.name ?? "Vaste klant";
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
      throw new Error(
        "Wachtwoord opslaan mislukt. Kies een sterker wachtwoord en probeer opnieuw.",
      );
    }

    const customerName = (acc.customers as { name?: string } | null)?.name ?? "Vaste klant";
    return { email: acc.email, customerName };
  });

export const requestPortalLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(254) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requestPortalLoginLink } = await import("./customer-portal.server");
    try {
      await requestPortalLoginLink(supabaseAdmin, data.email);
    } catch (e) {
      console.error("portal login request", e instanceof Error ? e.message : e);
    }
    // Never reveal whether an address is known.
    return { ok: true as const };
  });

export const getPortalOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolvePortalAccess, loadPortalScope } = await import("./customer-portal.server");
    const { workOrderStage, invoicePortalState, invoiceOpenAmount, portalWorkAddress } =
      await import("./customer-portal");
    const access = await resolvePortalAccess(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: unknown })?.email,
    );

    const [{ data: customers }, scope] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select(
          "id, name, street, house_number, postal_code, city, phone, email, billing_email, vat_number, customer_number",
        )
        .in(
          "id",
          access.customerIds.length ? access.customerIds : ["00000000-0000-0000-0000-000000000000"],
        ),
      loadPortalScope(supabaseAdmin, access.email, access.customerIds),
    ]);

    const woNumber = new Map<string, number | null>(
      scope.workOrders.map((w: any) => [w.id, w.number ?? null]),
    );
    const today = new Date();
    const primary = (customers ?? [])[0] ?? null;

    return {
      accountEmail: access.email,
      customer: primary,
      customers: customers ?? [],
      workOrders: scope.workOrders.map((w: any) => ({
        id: w.id as string,
        number: (w.number ?? null) as number | null,
        stage: workOrderStage(w),
        scheduledDate: (w.scheduled_date ?? null) as string | null,
        scheduledFrom: w.scheduled_from ? String(w.scheduled_from).slice(0, 5) : null,
        scheduledUntil: w.scheduled_until ? String(w.scheduled_until).slice(0, 5) : null,
        description:
          (w.description ?? "").replace(/\[Aangevraagd via klantenportaal\]/g, "").trim() || null,
        projectName: (w.project_name ?? null) as string | null,
        address: portalWorkAddress(w),
        urgent: !!w.urgent,
        createdAt: w.created_at as string,
        signedAt: (w.signed_at ?? null) as string | null,
        hasPdf: w.status === "afgetekend",
      })),
      invoices: scope.invoices.map((inv: any) => ({
        id: inv.id as string,
        number: (inv.number ?? "") as string,
        kind: (inv.kind ?? "factuur") as string,
        issueDate: (inv.issue_date ?? null) as string | null,
        dueDate: (inv.due_date ?? null) as string | null,
        total: Number(inv.total ?? 0),
        openAmount: invoiceOpenAmount(inv),
        state: invoicePortalState(inv, today),
        workOrderNumber: inv.work_order_id ? (woNumber.get(inv.work_order_id) ?? null) : null,
      })),
      quotes: scope.quotes.map((q: any) => ({
        id: q.id as string,
        number: (q.number ?? "") as string,
        kind: (q.kind ?? "offerte") as string,
        status: q.status as string,
        total: Number(q.total ?? 0),
        date: (q.sent_at ?? q.created_at) as string,
        signedAt: (q.signed_at ?? null) as string | null,
        signUrl: q.status === "verzonden" && q.token ? `/offerte/${q.token}` : null,
      })),
    };
  });

const pdfResponse = (pdf: Uint8Array, filename: string) =>
  new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });

export const downloadPortalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ type: z.enum(["factuur", "werkbon"]), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolvePortalAccess, loadPortalScope } = await import("./customer-portal.server");
    const access = await resolvePortalAccess(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: unknown })?.email,
    );
    const scope = await loadPortalScope(supabaseAdmin, access.email, access.customerIds);

    if (data.type === "factuur") {
      if (!scope.invoices.some((i: any) => i.id === data.id))
        throw new Error("Document niet gevonden.");
      const { data: inv, error } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("id", data.id)
        .single();
      if (error || !inv) throw new Error("Document niet gevonden.");
      const { data: snapshot } = await supabaseAdmin
        .from("document_deliveries")
        .select("pdf_base64")
        .eq("document_id", inv.id)
        .eq("document_type", inv.kind === "creditnota" ? "creditnota" : "factuur")
        .eq("status", "accepted")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let pdf: Uint8Array;
      if (snapshot?.pdf_base64)
        pdf = Uint8Array.from(atob(snapshot.pdf_base64), (c) => c.charCodeAt(0));
      else {
        const { pdfData } = await import("./invoice-sending.server");
        const { createInvoicePdf } = await import("./invoice-pdf");
        pdf = await createInvoicePdf(await pdfData(supabaseAdmin, inv));
      }
      const label = inv.kind === "creditnota" ? "Creditnota" : "Factuur";
      return pdfResponse(pdf, `Riory-${label}-${inv.number ?? inv.id.slice(0, 8)}.pdf`);
    }

    const wo = scope.workOrders.find((w: any) => w.id === data.id);
    if (!wo || wo.status !== "afgetekend") throw new Error("Werkbon is nog niet beschikbaar.");
    const { data: full, error } = await supabaseAdmin
      .from("work_orders")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !full) throw new Error("Werkbon niet gevonden.");
    const [times, materials, activity] = await Promise.all([
      supabaseAdmin
        .from("time_entries")
        .select("started_at, ended_at")
        .eq("work_order_id", full.id),
      supabaseAdmin
        .from("materials")
        .select("name, quantity, unit")
        .eq("work_order_id", full.id)
        .order("created_at"),
      full.activity_id
        ? supabaseAdmin.from("activities").select("name").eq("id", full.activity_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (times.error || materials.error || activity.error)
      throw new Error("Werkbon kon niet geladen worden.");
    const { werkbonMailData } = await import("./werkbon-mail");
    const { totalSeconds } = await import("./time");
    const { createWerkbonPdf } = await import("./werkbon-pdf");
    const { loadWerkbonPhotos } = await import("./werkbon-photos.server");
    // Same allowlisted content as the werkbon mail the customer already received.
    const dto = werkbonMailData(
      {
        ...full,
        distance_km: full.distance_km == null ? null : Number(full.distance_km),
        paid_amount: full.paid_amount == null ? null : Number(full.paid_amount),
      },
      (activity.data as { name?: string } | null)?.name ?? null,
      totalSeconds(times.data ?? [], Date.now()),
      (materials.data ?? []).map((m) => ({
        name: m.name,
        quantity: Number(m.quantity),
        unit: m.unit,
      })),
    );
    const pdf = await createWerkbonPdf(dto, await loadWerkbonPhotos(supabaseAdmin, full.id));
    return pdfResponse(pdf, `Riory-Werkbon-${full.number ?? "nieuw"}.pdf`);
  });

export const submitPortalAppointmentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        description: z
          .string()
          .trim()
          .min(5, "Omschrijf kort het probleem of de gewenste werken.")
          .max(2000),
        preferredWindow: z.string().trim().max(120).optional(),
        contactPhone: z.string().trim().max(40).optional(),
        urgent: z.boolean().optional(),
        worksiteDifferent: z.boolean().optional(),
        worksiteStreet: z.string().trim().max(120).optional(),
        worksiteHouseNumber: z.string().trim().max(20).optional(),
        worksitePostalCode: z.string().trim().max(20).optional(),
        worksiteCity: z.string().trim().max(80).optional(),
        projectName: z.string().trim().max(120).optional(),
        customerId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolvePortalAccess } = await import("./customer-portal.server");
    const access = await resolvePortalAccess(
      supabaseAdmin,
      context.userId,
      (context.claims as { email?: unknown })?.email,
    );
    const customerId =
      data.customerId && access.customerIds.includes(data.customerId)
        ? data.customerId
        : access.customerIds[0];
    if (!customerId) throw new Error("Geen klantgegevens gevonden.");
    const account = { email: access.email };
    const { data: customer, error: custErr } = await supabaseAdmin
      .from("customers")
      .select(
        "id, name, street, house_number, postal_code, city, phone, email, billing_email, default_vat_rate, branch_id",
      )
      .eq("id", customerId)
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
        status: "nieuw",
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
