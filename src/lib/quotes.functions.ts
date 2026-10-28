import { createServerFn } from "@tanstack/react-start";
import { quoteSigningLink } from "@/lib/quote-signing-link";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, type InvoiceCustomer, type InvoiceLine } from "@/lib/invoice";
import { quoteTotals } from "@/lib/quote";
import type { QuotePdfData } from "@/lib/quote-pdf";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { WERKBON_MAILBOX_KEY } from "@/lib/werkbon-mailbox.functions";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";

type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen voor beheerder");
}

const b64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

async function sendMail(to: string, subject: string, body: string, attachment: { name: string; contentType: string; contentBytes: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  let key: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) break; }
  if (!key) throw new Error("Koppel eerst de mailbox info@riory.be");
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me/sendMail",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to } }],
      attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", ...attachment }],
    } }) },
    requiredScopes: WERKBON_MAIL_SCOPES,
  });
  if (await appUserReconnectRequired(res)) throw new Error("Koppel de mailbox info@riory.be opnieuw");
  if (!res.ok) throw new Error(`Mail versturen mislukt [${res.status}]: ${await res.text()}`);
}

async function quotePdfData(supabase: any, q: any): Promise<QuotePdfData> {
  const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single();
  return {
    number: q.number, issueDate: q.created_at.slice(0, 10), validUntil: addDays(q.created_at.slice(0, 10), 30),
    customer: q.customer as InvoiceCustomer, lines: q.lines as InvoiceLine[], vatRate: Number(q.vat_rate),
    net: Number(q.net), vat: Number(q.vat), total: Number(q.total),
    company: { name: s?.company_name ?? "Riory bv", vat: s?.company_vat ?? "BE0840931404", iban: s?.company_iban ?? null, bic: s?.company_bic ?? null },
    terms: s?.terms_text ?? null,
    signedName: q.signed_name, signedAt: q.signed_at,
    intro: q.intro ?? null,
  };
}

export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; intro?: string }) => ({
    customer: i.customer, lines: i.lines.slice(0, 200), vatRate: i.vatRate, intro: i.intro?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const t = quoteTotals(data.lines, data.vatRate);
    const { data: number, error: ne } = await context.supabase.rpc("next_quote_number");
    if (ne) throw new Error(ne.message);
    const { data: row, error } = await context.supabase.from("quotes").insert({
      number, customer: data.customer, lines: data.lines, vat_rate: data.vatRate, net: t.net, vat: t.vat, total: t.total, intro: data.intro,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Updates a quote that is not yet approved; recomputes totals from the lines. */
export const updateQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string; customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; intro?: string }) => ({
    quoteId: i.quoteId, customer: i.customer, lines: i.lines.slice(0, 200), vatRate: i.vatRate, intro: i.intro?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: q } = await context.supabase.from("quotes").select("status").eq("id", data.quoteId).single();
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status === "akkoord") throw new Error("Een ondertekende offerte kan niet meer gewijzigd worden");
    const t = quoteTotals(data.lines, data.vatRate);
    const { data: row, error } = await context.supabase.from("quotes").update({
      customer: data.customer, lines: data.lines, vat_rate: data.vatRate, net: t.net, vat: t.vat, total: t.total, intro: data.intro,
    }).eq("id", data.quoteId).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Creates a draft quote from a task's customer data and description, ready to complete. */
export const quoteFromTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: wo } = await context.supabase.from("work_orders").select("*").eq("id", data.workOrderId).single();
    if (!wo) throw new Error("Taak niet gevonden");
    const { quoteLine } = await import("@/lib/quote");
    const siteAddress = wo.use_site_address
      ? [wo.site_street && `${wo.site_street} ${wo.site_house_number ?? ""}`.trim(), [wo.site_postal_code, wo.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null
      : null;
    const customer: InvoiceCustomer = {
      name: wo.customer_name, address: wo.address, siteAddress,
      vatNumber: wo.vat_number, email: wo.billing_email || wo.email,
      street: wo.street, houseNumber: wo.house_number, postalCode: wo.postal_code, city: wo.city,
    };
    const lines = (wo.description ?? "").trim()
      ? [quoteLine((wo.description as string).trim().split("\n")[0]!, 1, "forfait", 0)]
      : [];
    const t = quoteTotals(lines, Number(wo.vat_rate));
    const { data: number, error: ne } = await context.supabase.rpc("next_quote_number");
    if (ne) throw new Error(ne.message);
    const { data: row, error } = await context.supabase.from("quotes").insert({
      number, customer, lines, vat_rate: Number(wo.vat_rate), net: t.net, vat: t.vat, total: t.total,
      intro: wo.project_name ? `Betreft: ${wo.project_name}` : null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Sends the quote PDF from info@riory.be with a signing link the customer can use to approve. */
export const sendQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: q } = await context.supabase.from("quotes").select("*").eq("id", data.quoteId).single();
    if (!q) throw new Error("Offerte niet gevonden");
    const to = (q.customer as InvoiceCustomer).email;
    if (!to) throw new Error("Deze offerte heeft geen e-mailadres van de klant");
    const { createQuotePdf } = await import("@/lib/quote-pdf");
    const pdf = b64(await createQuotePdf(await quotePdfData(context.supabase, q)));
    const link = quoteSigningLink(q.token);
    await sendMail(
      to,
      `Offerte ${q.number} — Riory`,
      `Beste ${(q.customer as InvoiceCustomer).name},\n\nIn de bijlage vindt u offerte ${q.number}.\n\nAkkoord? Onderteken de offerte via deze link:\n${link}\n\nMet vriendelijke groeten,\nRiory`,
      { name: `Offerte-${q.number}.pdf`, contentType: "application/pdf", contentBytes: pdf },
    );
    const { error } = await context.supabase.from("quotes").update({ status: "verzonden", sent_at: new Date().toISOString() }).eq("id", q.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const quotePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: q } = await context.supabase.from("quotes").select("*").eq("id", data.quoteId).single();
    if (!q) throw new Error("Offerte niet gevonden");
    const { createQuotePdf } = await import("@/lib/quote-pdf");
    return { number: q.number as string, base64: b64(await createQuotePdf(await quotePdfData(context.supabase, q))) };
  });

/** Converts an approved quote into a planned task with the quote's customer data and lines as description. */
export const convertQuoteToTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: q } = await context.supabase.from("quotes").select("*").eq("id", data.quoteId).single();
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status !== "akkoord") throw new Error("De klant heeft deze offerte nog niet ondertekend");
    if (q.work_order_id) return { workOrderId: q.work_order_id as string };
    const c = q.customer as InvoiceCustomer;
    const lines = (q.lines as InvoiceLine[]).map((l) => `- ${l.description}: ${l.quantity} ${l.unit}`).join("\n");
    const { data: wo, error } = await context.supabase.from("work_orders").insert({
      customer_name: c.name, street: c.street, house_number: c.houseNumber, postal_code: c.postalCode, city: c.city,
      address: c.address, email: c.email, vat_number: c.vatNumber, vat_rate: Number(q.vat_rate),
      description: `Offerte ${q.number} (ondertekend door ${q.signed_name ?? "klant"}):\n${lines}`,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("quotes").update({ work_order_id: wo.id }).eq("id", q.id);
    return { workOrderId: wo.id as string };
  });

// ---- Public signing (no login; the random token in the link is the secret) ----

export const getQuoteByToken = createServerFn({ method: "GET" })
  .inputValidator((i: { token: string }) => i)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: q } = await supabaseAdmin.from("quotes").select("number, customer, lines, vat_rate, net, vat, total, status, signed_name, signed_at, created_at").eq("token", data.token).maybeSingle();
    if (!q) throw new Error("Offerte niet gevonden");
    return q;
  });

export const signQuote = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; signature: string; name: string }) => {
    if (!i.signature.startsWith("data:image/png")) throw new Error("Handtekening ontbreekt");
    if (!i.name.trim()) throw new Error("Vul je naam in");
    return { token: i.token, signature: i.signature, name: i.name.trim() };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: q } = await supabaseAdmin.from("quotes").select("id, status").eq("token", data.token).maybeSingle();
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status === "akkoord") return { ok: true as const };
    const { error } = await supabaseAdmin.from("quotes").update({ status: "akkoord", signature: data.signature, signed_name: data.name, signed_at: new Date().toISOString() }).eq("id", q.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
