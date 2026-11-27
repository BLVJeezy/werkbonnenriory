import { brandedBody } from "./mail-html";
import { quoteMailText } from "./quote-mail-text";
import { createServerFn } from "@tanstack/react-start";
import { quoteSigningLink } from "@/lib/quote-signing-link";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, type InvoiceCustomer, type InvoiceLine } from "@/lib/invoice";
import { quoteTotals } from "@/lib/quote";
import type { QuotePdfData } from "@/lib/quote-pdf";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { WERKBON_MAILBOX_KEY } from "@/lib/werkbon-mailbox.functions";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";
import { PRODUCT_PHOTO_BUCKET, productPhotoPaths } from "./product-photos";

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
  const productPhotos: Record<string, Uint8Array> = {};
  for (const path of productPhotoPaths((q.lines as InvoiceLine[]).flatMap(l => l.photoPaths ?? []))) {
    const { data: file, error } = await supabase.storage.from(PRODUCT_PHOTO_BUCKET).download(path);
    if (error || !file) throw new Error("Een productfoto kon niet geladen worden. De offerte is niet verzonden.");
    productPhotos[path] = new Uint8Array(await file.arrayBuffer());
  }
  return {
    productPhotos,
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

type QuoteExtra = {
  kind?: string;
  customerId?: string | null;
  damageCause?: string;
  damageFindings?: string;
  photoPaths?: string[];
  contractRepeatEvery?: number;
  contractRepeatUnit?: string;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  useSiteAddress?: boolean;
  siteStreet?: string | null;
  siteHouseNumber?: string | null;
  sitePostalCode?: string | null;
  siteCity?: string | null;
};
const extraFields = (i: QuoteExtra) => {
  const kind = i.kind === "verzekering" ? "verzekering" : i.kind === "contract" ? "contract" : "offerte";
  const site = !!i.useSiteAddress && !!(i.siteStreet?.trim() || i.siteCity?.trim());
  return {
    use_site_address: site,
    site_street: site ? i.siteStreet?.trim() || null : null,
    site_house_number: site ? i.siteHouseNumber?.trim() || null : null,
    site_postal_code: site ? i.sitePostalCode?.trim() || null : null,
    site_city: site ? i.siteCity?.trim() || null : null,
    kind,
    customer_id: i.customerId || null,
    damage_cause: kind === "verzekering" ? i.damageCause?.trim() || null : null,
    damage_findings: kind === "verzekering" ? i.damageFindings?.trim() || null : null,
    photo_paths: kind === "verzekering" ? (i.photoPaths ?? []).filter((p) => typeof p === "string").slice(0, 40) : [],
    contract_repeat_every: kind === "contract" ? Math.max(1, Number(i.contractRepeatEvery) || 6) : 6,
    contract_repeat_unit: kind === "contract" && ["week", "maand", "jaar"].includes(i.contractRepeatUnit ?? "") ? i.contractRepeatUnit! : "maand",
    contract_start_date: kind === "contract" ? i.contractStartDate || null : null,
    contract_end_date: kind === "contract" ? i.contractEndDate || null : null,
  };
};

export const createQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; intro?: string } & QuoteExtra) => ({
    customer: i.customer, lines: i.lines.slice(0, 200).map(l => ({ ...l, photoPaths: productPhotoPaths(l.photoPaths) })), vatRate: i.vatRate, intro: i.intro?.trim() || null, extra: extraFields(i),
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
    quoteId: i.quoteId, customer: i.customer, lines: i.lines.slice(0, 200).map(l => ({ ...l, photoPaths: productPhotoPaths(l.photoPaths) })), vatRate: i.vatRate, intro: i.intro?.trim() || null, extra: extraFields(i),
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
      use_site_address: !!wo.use_site_address,
      site_street: wo.use_site_address ? wo.site_street : null,
      site_house_number: wo.use_site_address ? wo.site_house_number : null,
      site_postal_code: wo.use_site_address ? wo.site_postal_code : null,
      site_city: wo.use_site_address ? wo.site_city : null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Price-free report data from a signed work order: facts, findings, materials (quantities only) and photo paths. */
async function workOrderReport(supabase: any, wo: any) {
  const [photosRes, timeRes, matRes, actsRes, crewRes] = await Promise.all([
    supabase.from("work_order_photos").select("path").eq("work_order_id", wo.id).order("created_at"),
    supabase.from("time_entries").select("started_at, ended_at").eq("work_order_id", wo.id),
    supabase.from("materials").select("name, quantity, unit").eq("work_order_id", wo.id).order("created_at"),
    supabase.from("activities").select("id, name"),
    wo.technician_id ? supabase.from("technicians").select("name").eq("id", wo.technician_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [photosRes, timeRes, matRes, actsRes]) if (r.error) throw new Error(r.error.message);
  const photos = (photosRes.data ?? []) as { path: string }[];
  const seconds = (timeRes.data ?? []).reduce((s: number, e: any) => s + (e.ended_at ? (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000 : 0), 0);
  const act = (actsRes.data ?? []).find((a: any) => a.id === wo.activity_id) ?? null;
  const { buildInvoice } = await import("@/lib/invoice");
  const { billableHours } = await import("@/lib/billing");
  const { insuranceReport } = await import("@/lib/insurance-report");
  const materials = (matRes.data ?? []) as any[];
  const customer: InvoiceCustomer = buildInvoice({ wo: { ...wo, distance_km: null, vat_rate: Number(wo.vat_rate) }, activity: null, seconds: 0, kmRate: 0, materials: [] }).customer;
  const report = insuranceReport(wo, {
    crew: crewRes.data?.name ?? null, activity: act?.name ?? null, hours: billableHours(seconds),
    materials: materials.map((m) => ({ name: m.name, quantity: Number(m.quantity), unit: m.unit })), photoCount: photos.length,
  });
  return { report, customer, photos };
}

/** Price-free insurance report PDF (findings + photos) for a signed work order; no quote is created. */
async function renderInsuranceReport(context: Ctx, workOrderId: string) {
    await assertAdmin(context);
    const { data: wo } = await context.supabase.from("work_orders").select("*").eq("id", workOrderId).single();
    if (!wo) throw new Error("Werkbon niet gevonden");
    if (wo.status !== "afgetekend") throw new Error("Alleen van een afgewerkte werkbon kan een verslag gemaakt worden");
    const { report, customer, photos } = await workOrderReport(context.supabase, wo);
    const { data: s } = await context.supabase.from("settings").select("company_name, company_vat").eq("id", 1).single();
    const today = new Date().toISOString().slice(0, 10);
    const { createQuotePdf } = await import("@/lib/quote-pdf");
    const pdf = await createQuotePdf({
      report: true, kind: "verzekering", number: wo.number ? `Werkbon #${wo.number}` : "Verslag", issueDate: today, validUntil: today, customer, lines: [], vatRate: 0, net: 0, vat: 0, total: 0,
      company: { name: s?.company_name ?? "Riory bv", vat: s?.company_vat ?? "BE0840931404", iban: null, bic: null }, terms: null,
      intro: report.intro.replace(/^VERSLAG VOOR DE VERZEKERING\n\n/, ""), damageFindings: wo.insurance_report_text?.trim() || report.findings,
    }, await quotePhotos(context.supabase, { kind: "verzekering", photo_paths: photos.map((p) => p.path).slice(0, 40) }));
    return { name: `Verslag-verzekering-${wo.number ?? "werkbon"}.pdf`, base64: b64(pdf) };
}

export const insuranceReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(async ({ data, context }) => {
    return renderInsuranceReport(context, data.workOrderId);
  });

export const sendInsuranceReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (input: unknown) => {
    const { z } = await import('zod');
    return z.object({ workOrderId: z.string().uuid(), email: z.string().trim().email() }).parse(input);
  })
  .handler(async ({ data, context }) => {
    const pdf = await renderInsuranceReport(context, data.workOrderId);
    await sendMail(data.email, 'Verslag voor de verzekering — Riory', 'Beste,\n\nIn bijlage vindt u het verslag van onze interventie voor uw verzekeringsdossier.\n\nMet vriendelijke groeten,\nRiory', { name: pdf.name, contentType: 'application/pdf', contentBytes: pdf.base64 });
    return { accepted: true };
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
    // Al verstuurd of ondertekend: niet meer overschrijven.
    if (existing && existing.status !== "concept") return existing;
    const { report, customer, photos } = await workOrderReport(context.supabase, wo);
    // Een bestek krijgt eigen prijzen per titel, niet de werkbonprijzen; bestaande conceptposten blijven.
    const lines = (existing?.lines as InvoiceLine[] | undefined) ?? [];
    const t = quoteTotals(lines, Number(wo.vat_rate));
    const fields = {
      customer, lines, vat_rate: Number(wo.vat_rate), net: t.net, vat: t.vat, total: t.total,
      customer_id: wo.customer_id,
      photo_paths: photos.map((p) => p.path).slice(0, 40),
      intro: report.intro.replace(/^VERSLAG VOOR DE VERZEKERING\n\n/, ""), damage_findings: report.findings,
      technician_id: wo.technician_id,
    };
    if (existing) {
      const { data: row, error } = await context.supabase.from("quotes").update(fields).eq("id", existing.id).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: number, error: ne } = await context.supabase.rpc("next_quote_number");
    if (ne) throw new Error(ne.message);
    const { data: row, error } = await context.supabase.from("quotes").insert({
      ...fields, number, kind: "verzekering", source_work_order_id: wo.id,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Renders either a standard/insurance quote PDF or an airtight Riory maintenance contract PDF when kind === "contract". */
async function renderQuotePdfBytes(supabase: any, q: any): Promise<Uint8Array> {
  if (q.kind === "contract") {
    const { data: s } = await supabase.from("settings").select("company_name,company_vat,base_address,km_rate").eq("id", 1).maybeSingle();
    const { createContractPdf } = await import("@/lib/contract-pdf");
    const c = (q.customer ?? {}) as InvoiceCustomer;
    const lines = ((q.lines as InvoiceLine[]) ?? []).filter((l) => !l.optional && l.description.trim().length > 0).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity) || 1,
      unit: l.unit || "st",
      unitPrice: Number(l.originalUnitPrice ?? l.unitPrice) || 0,
      discount: Number(l.discount) || 0,
      vatRate: ([0, 6, 12, 21].includes(Number(l.vatRate ?? q.vat_rate)) ? Number(l.vatRate ?? q.vat_rate) : 21) as 0 | 6 | 12 | 21,
    }));
    return createContractPdf({
      number: q.number,
      name: q.intro?.trim() || lines[0]?.description || `Onderhoudscontract ${q.number}`,
      date: (q.created_at as string).slice(0, 10),
      startDate: q.contract_start_date ?? null,
      endDate: q.contract_end_date ?? null,
      repeatEvery: Number(q.contract_repeat_every) || 6,
      repeatUnit: (q.contract_repeat_unit || "maand") as "week" | "maand" | "jaar",
      description: q.intro?.trim() || null,
      company: { name: s?.company_name ?? "Riory BV", vat: s?.company_vat ?? "BE0840931404", address: s?.base_address ?? "Natveld 47, 3740 Bilzen", kmRate: s?.km_rate ?? 1.45 },
      customer: { name: c.name, address: c.siteAddress || c.address || null, vatNumber: c.vatNumber ?? null, email: c.email ?? null },
      lines,
      fallbackAmount: Number(q.net) || null,
      signedName: q.signed_name ?? null,
      signedAt: q.signed_at ?? null,
    });
  }
  const { createQuotePdf } = await import("@/lib/quote-pdf");
  return createQuotePdf(await quotePdfData(supabase, q), await quotePhotos(supabase, q));
}

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
    const pdf = b64(await renderQuotePdfBytes(context.supabase, q));
    const link = quoteSigningLink(q.token);
    const { prepareDocument } = await import('./document-tracking.server');
    const { linkText } = await import('./document-tracking');
    const tracking = await prepareDocument('offerte', q.id, `Offerte ${q.number}`, to, pdf);
    const docLabel = q.kind === "verzekering" ? "Bestek" : q.kind === "contract" ? "Onderhoudscontract" : "Offerte";
    await tracking.send(() => sendMail(
      to,
      `${docLabel} ${q.number} — Riory`,
      linkText(quoteMailText({ kind: q.kind, number: q.number as string, customerName: (q.customer as InvoiceCustomer).name, link, lines: (q.lines as InvoiceLine[]) ?? [] }), tracking.url),
      { name: `${docLabel}-${q.number}.pdf`, contentType: "application/pdf", contentBytes: pdf },
    ));
    const { error } = await context.supabase.from("quotes").update({ status: "verzonden", sent_at: new Date().toISOString(), reminder_stage: 0, reminder_error: null }).eq("id", q.id);
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
    return { number: q.number as string, base64: b64(await renderQuotePdfBytes(context.supabase, q)) };
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
    const paths = productPhotoPaths((q.lines as InvoiceLine[]).flatMap(l => l.photoPaths ?? []));
    const photoUrls: Record<string, string> = {};
    if (paths.length) {
      const { data: signed, error } = await supabaseAdmin.storage.from(PRODUCT_PHOTO_BUCKET).createSignedUrls(paths, 3600);
      if (error) throw new Error("Productfoto’s konden niet geladen worden");
      for (const photo of signed ?? []) if (photo.path && photo.signedUrl) photoUrls[photo.path] = photo.signedUrl;
    }
    return { ...q, photoUrls };
  });

export const signQuote = createServerFn({ method: "POST" })
  .inputValidator((i: { token: string; signature: string; name: string; options?: number[] }) => {
    if (!i.signature.startsWith("data:image/png")) throw new Error("Handtekening ontbreekt");
    if (!i.name.trim()) throw new Error("Vul je naam in");
    const options = (i.options ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < 500);
    return { token: i.token, signature: i.signature, name: i.name.trim(), options };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signQuoteRecord } = await import("@/lib/quote-sign.server");
    return signQuoteRecord(supabaseAdmin, { column: "token", value: data.token }, data);
  });

/** Deletes a quote that is not signed and not turned into a task. */
export const deleteQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { quoteId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: q } = await context.supabase.from("quotes").select("status, work_order_id").eq("id", data.quoteId).single();
    if (!q) throw new Error("Offerte niet gevonden");
    if (q.status === "akkoord" || q.work_order_id) throw new Error("Een ondertekende of omgezette offerte kan niet verwijderd worden");
    const { error } = await context.supabase.from("quotes").delete().eq("id", data.quoteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function renderPriceList(ctx: Ctx, sel: { productIds: string[]; activityIds: string[] }) {
  if (!sel.productIds.length && !sel.activityIds.length) throw new Error("Vink minstens één product of activiteit aan");
  await assertAdmin(ctx);
  const [{ data: s }, { data: acts }, { data: prods }] = await Promise.all([
    ctx.supabase.from("settings").select("company_name,company_vat,km_rate,base_address").eq("id", 1).single(),
    ctx.supabase.from("activities").select("name,hourly_rate,description").in("id", sel.activityIds.length ? sel.activityIds : ["00000000-0000-0000-0000-000000000000"]).order("name"),
    ctx.supabase.from("products").select("name,unit,price,description").in("id", sel.productIds.length ? sel.productIds : ["00000000-0000-0000-0000-000000000000"]).order("name"),
  ]);
  const { createPriceListPdf } = await import("@/lib/price-list-pdf");
  const today = new Date().toISOString().slice(0, 10);
  const pdf = await createPriceListPdf({
    date: today,
    company: { name: s?.company_name ?? "Riory bv", vat: s?.company_vat ?? "BE0840931404" },
    activities: (acts ?? []).filter((a: any) => a.hourly_rate != null).map((a: any) => ({ name: a.name, hourlyRate: Number(a.hourly_rate), description: a.description })),
    products: (prods ?? []).map((p: any) => ({ name: p.name, unit: p.unit, price: Number(p.price), description: p.description })),
    travel: { kmRate: Number(s?.km_rate ?? 0), baseAddress: s?.base_address ?? null },
  });
  return { name: `Prijslijst-Riory-${today}.pdf`, base64: b64(pdf) };
}

const priceListSel = async (input: unknown) => {
  const { z } = await import("zod");
  return z.object({ productIds: z.array(z.string().uuid()).max(2000), activityIds: z.array(z.string().uuid()).max(500) }).parse(input);
};

export const priceListPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(priceListSel)
  .handler(async ({ data, context }) => renderPriceList(context, data));

export const sendPriceList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(async (input: unknown) => {
    const { z } = await import("zod");
    const sel = await priceListSel(input);
    return { ...sel, email: z.string().trim().email().parse((input as any)?.email) };
  })
  .handler(async ({ data, context }) => {
    const pdf = await renderPriceList(context, data);
    await sendMail(data.email, "Prijslijst — Riory", "Beste,\n\nIn bijlage vindt u onze actuele prijslijst.\n\nMet vriendelijke groeten,\nRiory", { name: pdf.name, contentType: "application/pdf", contentBytes: pdf.base64 });
    return { accepted: true };
  });
