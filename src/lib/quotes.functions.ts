import { brandedBody } from "./mail-html";
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
      body: brandedBody(body),
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
    kind: q.kind, damageCause: q.damage_cause ?? null, damageFindings: q.damage_findings ?? null,
  };
}

/** Private photo bytes for an insurance estimate, read with the admin's RLS-scoped client. */
async function quotePhotos(supabase: any, q: any): Promise<Uint8Array[]> {
  if (q.kind !== "verzekering") return [];
  const out: Uint8Array[] = [];
  for (const path of (q.photo_paths ?? []) as string[]) {
    const { data: file, error } = await supabase.storage.from("werkbon-fotos").download(path);
    if (error || !file) throw new Error("Een foto van het bestek kon niet geladen worden");
    out.push(new Uint8Array(await file.arrayBuffer()));
  }
  return out;
}

type QuoteExtra = { kind?: string; customerId?: string | null; damageCause?: string; damageFindings?: string; photoPaths?: string[] };
const extraFields = (i: QuoteExtra) => {
  const kind = i.kind === "verzekering" ? "verzekering" : "offerte";
  return {
    kind,
    customer_id: i.customerId || null,
    damage_cause: kind === "verzekering" ? i.damageCause?.trim() || null : null,
    damage_findings: kind === "verzekering" ? i.damageFindings?.trim() || null : null,
    photo_paths: kind === "verzekering" ? (i.photoPaths ?? []).filter((p) => typeof p === "string").slice(0, 40) : [],
  };
};

export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; intro?: string } & QuoteExtra) => ({
    customer: i.customer, lines: i.lines.slice(0, 200), vatRate: i.vatRate, intro: i.intro?.trim() || null, extra: extraFields(i),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const t = quoteTotals(data.lines, data.vatRate);
    const { data: number, error: ne } = await context.supabase.rpc("next_quote_number");
    if (ne) throw new Error(ne.message);
    const { data: row, error } = await context.supabase.from("quotes").insert({
      number, customer: data.customer, lines: data.lines, vat_rate: data.vatRate, net: t.net, vat: t.vat, total: t.total, intro: data.intro, ...data.extra,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Updates a quote that is not yet approved; recomputes totals from the lines. */
export const updateQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string; customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; intro?: string } & QuoteExtra) => ({
    quoteId: i.quoteId, customer: i.customer, lines: i.lines.slice(0, 200), vatRate: i.vatRate, intro: i.intro?.trim() || null, extra: extraFields(i),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: q } = await context.supabase.from("quotes").select("status").eq("id", data.quoteId).single();
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status === "akkoord") throw new Error("Een ondertekende offerte kan niet meer gewijzigd worden");
    const t = quoteTotals(data.lines, data.vatRate);
    const { data: row, error } = await context.supabase.from("quotes").update({
      customer: data.customer, lines: data.lines, vat_rate: data.vatRate, net: t.net, vat: t.vat, total: t.total, intro: data.intro, ...data.extra,
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
    const { data: existing, error: existingError } = await context.supabase.from("quotes").select("*").eq("source_work_order_id", wo.id).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return existing;
    if (wo.status === "afgetekend") throw new Error("Alleen een open taak kan worden omgezet naar offerte");
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
      ? [quoteLine((wo.description as string).trim().split("\n")[0] ?? "", 1, "forfait", 0)]
      : [];
    const t = quoteTotals(lines, Number(wo.vat_rate));
    const { data: number, error: ne } = await context.supabase.rpc("next_quote_number");
    if (ne) throw new Error(ne.message);
    const { data: row, error } = await context.supabase.from("quotes").insert({
      number, customer, lines, source_work_order_id: wo.id, vat_rate: Number(wo.vat_rate), net: t.net, vat: t.vat, total: t.total,
      intro: wo.project_name ? `Betreft: ${wo.project_name}` : null,
      technician_id: wo.technician_id,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Creates a draft insurance estimate (bestek) from a completed work order, with its photos. */
export const bestekFromWorkOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: wo } = await context.supabase.from("work_orders").select("*").eq("id", data.workOrderId).single();
    if (!wo) throw new Error("Werkbon niet gevonden");
    if (wo.status !== "afgetekend") throw new Error("Alleen een afgewerkte werkbon kan worden omgezet naar een bestek");
    const { data: existing, error: existingError } = await context.supabase
      .from("quotes").select("*").eq("source_work_order_id", wo.id).eq("kind", "verzekering").maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return existing;
    const { data: photos, error: photosError } = await context.supabase
      .from("work_order_photos").select("path").eq("work_order_id", wo.id).order("created_at");
    if (photosError) throw new Error(photosError.message);
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
      ? [quoteLine((wo.description as string).trim().split("\n")[0] ?? "", 1, "forfait", 0)]
      : [];
    const t = quoteTotals(lines, Number(wo.vat_rate));
    const { data: number, error: ne } = await context.supabase.rpc("next_quote_number");
    if (ne) throw new Error(ne.message);
    const { data: row, error } = await context.supabase.from("quotes").insert({
      number, customer, lines, vat_rate: Number(wo.vat_rate), net: t.net, vat: t.vat, total: t.total,
      kind: "verzekering",
      customer_id: wo.customer_id,
      photo_paths: (photos ?? []).map((p: { path: string }) => p.path).slice(0, 40),
      source_work_order_id: wo.id,
      intro: wo.project_name ? `Betreft: ${wo.project_name}` : null,
      technician_id: wo.technician_id,
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
    const pdf = b64(await createQuotePdf(await quotePdfData(context.supabase, q), await quotePhotos(context.supabase, q)));
    const link = quoteSigningLink(q.token);
    const { prepareDocument } = await import('./document-tracking.server');
    const { linkText } = await import('./document-tracking');
    const tracking = await prepareDocument('offerte', q.id, `Offerte ${q.number}`, to, pdf);
    await tracking.send(() => sendMail(
      to,
      `${q.kind === "verzekering" ? "Bestek" : "Offerte"} ${q.number} — Riory`,
      linkText(`Beste ${(q.customer as InvoiceCustomer).name},\n\nIn de bijlage vindt u ${q.kind === "verzekering" ? "het bestek voor uw verzekering" : "offerte"} ${q.number}.\n\nAkkoord? Onderteken de offerte via deze link:\n${link}\n\nMet vriendelijke groeten,\nRiory`, tracking.url),
      { name: `Offerte-${q.number}.pdf`, contentType: "application/pdf", contentBytes: pdf },
    ));
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
    return { number: q.number as string, base64: b64(await createQuotePdf(await quotePdfData(context.supabase, q), await quotePhotos(context.supabase, q))) };
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
    const { data: workOrderId, error } = await context.supabase.rpc("convert_approved_quote", { p_id: q.id });
    if (error) throw new Error(error.message);
    return { workOrderId: workOrderId as string };
  });

export const assignQuoteCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string; technicianId: string | null }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("quotes").update({ technician_id: data.technicianId }).eq("id", data.quoteId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
