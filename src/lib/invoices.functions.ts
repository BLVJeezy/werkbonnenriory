import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, buildInvoice, isFullyPaid, peppolIdFromVat, type InvoiceCustomer, type InvoiceLine } from "@/lib/invoice";
import type { InvoicePdfData } from "@/lib/invoice-pdf";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { WERKBON_MAILBOX_KEY } from "@/lib/werkbon-mailbox.functions";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";

type Ctx = { supabase: any; userId: string };
const SENDER_PEPPOL_ID = "0208:0840931404";

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen voor beheerder");
}

const b64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

async function pdfData(supabase: any, inv: any): Promise<InvoicePdfData> {
  const [{ data: s }, { data: wo }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("work_orders").select("number").eq("id", inv.work_order_id).single(),
  ]);
  return {
    number: inv.number, issueDate: inv.issue_date, dueDate: inv.due_date, workOrderNumber: wo?.number ?? 0,
    customer: inv.customer as InvoiceCustomer, lines: inv.lines as InvoiceLine[], vatRate: Number(inv.vat_rate),
    net: Number(inv.net), vat: Number(inv.vat), total: Number(inv.total), paidAmount: Number(inv.paid_amount),
    company: { name: s?.company_name ?? "Riory bv", vat: s?.company_vat ?? "BE0840931404", iban: s?.company_iban ?? null, bic: s?.company_bic ?? null },
    terms: s?.terms_text ?? null,
  };
}

// ---- Dokapi (Peppol) ----
function dokapiConfig() {
  const id = process.env["DOKAPI_CLIENT_ID"], secret = process.env["DOKAPI_CLIENT_SECRET"];
  if (!id || !secret) return null;
  return {
    id, secret,
    base: process.env["DOKAPI_BASE_URL"] || "https://peppol-api.dokapi.io/v1",
    tokenUrl: process.env["DOKAPI_TOKEN_URL"] || "https://portal.dokapi.io/api/oauth2/token",
  };
}
async function dokapiToken(c: NonNullable<ReturnType<typeof dokapiConfig>>) {
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.id, client_secret: c.secret }),
  });
  if (!res.ok) throw new Error(`Dokapi-aanmelding mislukt [${res.status}]: ${await res.text()}`);
  return (await res.json()).access_token as string;
}
async function peppolReachable(c: NonNullable<ReturnType<typeof dokapiConfig>>, token: string, id: string) {
  const res = await fetch(`${c.base}/participant-registrations/lookup?value=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Peppol-opzoeking mislukt [${res.status}]: ${await res.text()}`);
  return true;
}
async function sendPeppol(c: NonNullable<ReturnType<typeof dokapiConfig>>, token: string, receiver: string, ref: string, xml: string) {
  const res = await fetch(`${c.base}/outgoing-peppol-documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { value: SENDER_PEPPOL_ID, scheme: "iso6523-actorid-upis" },
      receiver: { value: receiver, scheme: "iso6523-actorid-upis" },
      c1CountryCode: "BE",
      documentTypeIdentifier: { scheme: "busdox-docid-qns", value: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1" },
      processIdentifier: { scheme: "cenbii-procid-ubl", value: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0" },
      externalReference: ref,
    }),
  });
  if (!res.ok) throw new Error(`Peppol-verzending mislukt [${res.status}]: ${await res.text()}`);
  const body = await res.json();
  if (!body.preSignedUploadUrl) throw new Error("Dokapi gaf geen upload-adres terug");
  const up = await fetch(body.preSignedUploadUrl, { method: "PUT", headers: { "Content-Type": "application/xml" }, body: xml });
  if (!up.ok) throw new Error(`Peppol-upload mislukt [${up.status}]: ${await up.text()}`);
}

// ---- Mail via info@riory.be ----
async function sendMail(to: string, number: string, pdfBase64: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  let key: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) break; }
  if (!key) throw new Error("Koppel eerst de mailbox info@riory.be");
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me/sendMail",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: {
      subject: `Factuur ${number} — Riory`,
      body: { contentType: "Text", content: `Beste klant,\n\nIn de bijlage vindt u factuur ${number} als pdf.\n\nBedankt voor uw vertrouwen.\n\nMet vriendelijke groeten,\nRiory` },
      toRecipients: [{ emailAddress: { address: to } }],
      attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: `Factuur-${number}.pdf`, contentType: "application/pdf", contentBytes: pdfBase64 }],
    } }) },
    requiredScopes: WERKBON_MAIL_SCOPES,
  });
  if (await appUserReconnectRequired(res)) throw new Error("Koppel de mailbox info@riory.be opnieuw");
  if (!res.ok) throw new Error(`Mail versturen mislukt [${res.status}]: ${await res.text()}`);
}

async function sendOne(supabase: any, inv: any) {
  try {
    const d = await pdfData(supabase, inv);
    const { createInvoicePdf } = await import("@/lib/invoice-pdf");
    const pdf = b64(await createInvoicePdf(d));
    const peppolId = peppolIdFromVat(d.customer.vatNumber);
    const dk = dokapiConfig();
    let via: "peppol" | "email" | null = null, to = "";
    if (peppolId && dk) {
      const token = await dokapiToken(dk);
      if (await peppolReachable(dk, token, peppolId)) {
        const { invoiceUbl } = await import("@/lib/invoice-ubl");
        await sendPeppol(dk, token, peppolId, d.number, invoiceUbl(d, { senderId: SENDER_PEPPOL_ID, receiverId: peppolId, pdfBase64: pdf }));
        via = "peppol"; to = peppolId;
      }
    }
    if (!via) {
      if (!d.customer.email) throw new Error("Geen Peppol mogelijk en geen e-mailadres bij de klant");
      await sendMail(d.customer.email, d.number, pdf);
      via = "email"; to = d.customer.email;
    }
    await supabase.from("invoices").update({ status: "verzonden", sent_via: via, sent_to: to, sent_at: new Date().toISOString(), send_error: null }).eq("id", inv.id);
    return { id: inv.id, ok: true as const, via };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("invoices").update({ status: "fout", send_error: msg }).eq("id", inv.id);
    return { id: inv.id, ok: false as const, error: msg };
  }
}

/** Converts signed work orders to invoices; fully paid ones are sent right away, open ones wait for a manual send. */
export const createInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderIds: string[] }) => ({ workOrderIds: i.workOrderIds.slice(0, 100) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single();
    const { data: acts } = await supabase.from("activities").select("*");
    const created: string[] = [], skipped: number[] = [];
    let sent = 0, failed = 0;
    for (const id of data.workOrderIds) {
      const { data: wo } = await supabase.from("work_orders").select("*").eq("id", id).single();
      if (!wo || wo.status !== "afgetekend") continue;
      const { data: existing } = await supabase.from("invoices").select("id").eq("work_order_id", id).maybeSingle();
      if (existing) { skipped.push(wo.number); continue; }
      const [t, m] = await Promise.all([
        supabase.from("time_entries").select("*").eq("work_order_id", id),
        supabase.from("materials").select("*").eq("work_order_id", id).order("created_at"),
      ]);
      const seconds = (t.data ?? []).reduce((sum: number, e: any) => sum + (e.ended_at ? (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000 : 0), 0);
      const act = (acts ?? []).find((a: any) => a.id === wo.activity_id) ?? null;
      const inv = buildInvoice({ wo: { ...wo, distance_km: wo.distance_km == null ? null : Number(wo.distance_km), vat_rate: Number(wo.vat_rate) }, activity: act, seconds, kmRate: Number(s?.km_rate ?? 0), materials: m.data ?? [] });
      const { data: number, error: ne } = await supabase.rpc("next_invoice_number");
      if (ne) throw new Error(ne.message);
      const issue = new Date().toISOString().slice(0, 10);
      const { data: row, error } = await supabase.from("invoices").insert({
        number, work_order_id: id, issue_date: issue, due_date: addDays(issue, Number(s?.payment_days ?? 14)),
        customer: inv.customer, lines: inv.lines, vat_rate: inv.vatRate, net: inv.net, vat: inv.vat, total: inv.total, paid_amount: inv.paidAmount,
      }).select("*").single();
      if (error) throw new Error(error.message);
      created.push(row.number);
      if (isFullyPaid(inv.total, inv.paidAmount)) { const r = await sendOne(supabase, row); r.ok ? sent++ : failed++; }
    }
    return { created, skipped, sent, failed };
  });

export const sendInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceIds: string[] }) => ({ invoiceIds: i.invoiceIds.slice(0, 100) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase.from("invoices").select("*").in("id", data.invoiceIds);
    const results = [];
    for (const r of rows ?? []) results.push(await sendOne(context.supabase, r));
    return results;
  });

export const invoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: inv } = await context.supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
    if (!inv) throw new Error("Factuur niet gevonden");
    const { createInvoicePdf } = await import("@/lib/invoice-pdf");
    return { number: inv.number as string, base64: b64(await createInvoicePdf(await pdfData(context.supabase, inv))) };
  });
