import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, buildCreditNote, buildInvoice, isFullyPaid, peppolIdFromVat, type InvoiceCustomer, type InvoiceLine } from "@/lib/invoice";
import type { InvoicePdfData } from "@/lib/invoice-pdf";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { WERKBON_MAILBOX_KEY } from "@/lib/werkbon-mailbox.functions";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";
import { deliverInvoice, invoiceMail, invoiceMailWithCc, OKIOKI_INVOICE_EMAIL } from "@/lib/invoice-delivery";

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
  let extra: { title: string; reference: string } | null = null;
  if (inv.kind === "creditnota") {
    const { data: orig } = inv.credit_for ? await supabase.from("invoices").select("number").eq("id", inv.credit_for).maybeSingle() : { data: null };
    extra = { title: "CREDITNOTA", reference: `Creditnota voor factuur ${orig?.number ?? "onbekend"}` };
  }
  return {
    number: inv.number, issueDate: inv.issue_date, dueDate: inv.due_date, workOrderNumber: wo?.number ?? 0,
    customer: inv.customer as InvoiceCustomer, lines: inv.lines as InvoiceLine[], vatRate: Number(inv.vat_rate),
    net: Number(inv.net), vat: Number(inv.vat), total: Number(inv.total), paidAmount: Number(inv.paid_amount),
    company: { name: s?.company_name ?? "Riory bv", vat: s?.company_vat ?? "BE0840931404", iban: s?.company_iban ?? null, bic: s?.company_bic ?? null },
    terms: s?.terms_text ?? null,
    ...(extra ?? {}),
  };
}

// ---- Mail via info@riory.be ----
async function sendMail(to: string, number: string, contentBytes: string, format: "pdf" | "ubl", label = "Factuur", payload?: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  let key: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) break; }
  if (!key) throw new Error("Koppel eerst de mailbox info@riory.be");
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me/sendMail",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload ?? invoiceMail(to, number, contentBytes, format, label)) },
    requiredScopes: WERKBON_MAIL_SCOPES,
  });
  if (await appUserReconnectRequired(res)) throw new Error("Koppel de mailbox info@riory.be opnieuw");
  if (!res.ok) {
    const body = await res.text();
    console.error(`Factuurmail mislukt [${res.status}]: ${body}`);
    throw new Error(`Mail versturen mislukt [${res.status}]: ${body}`);
  }
}

async function sendOne(supabase: any, inv: any) {
  if (inv.status === "verzonden") return { id: inv.id, ok: true as const, via: inv.sent_via };
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase.from("invoices")
    .update({ delivery_lock_until: new Date(Date.now() + 300000).toISOString() })
    .eq("id", inv.id).neq("status", "verzonden")
    .or(`delivery_lock_until.is.null,delivery_lock_until.lt.${now}`).select("*").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { id: inv.id, ok: false as const, error: "Deze factuur wordt al verzonden; probeer later opnieuw" };
  inv = claimed;
  try {
    const d = await pdfData(supabase, inv);
    const label = inv.kind === "creditnota" ? "Creditnota" : "Factuur";
    const { createInvoicePdf } = await import("@/lib/invoice-pdf");
    const pdf = b64(await createInvoicePdf(d));
    const { invoiceUbl } = await import("@/lib/invoice-ubl");
    const ubl = b64(new TextEncoder().encode(invoiceUbl(d, { senderId: SENDER_PEPPOL_ID, receiverId: peppolIdFromVat(d.customer.vatNumber), pdfBase64: pdf, creditNote: inv.kind === "creditnota" })));
    await deliverInvoice({
      customer: d.customer, pdfSent: Boolean(inv.pdf_sent_at), okiokiSent: Boolean(inv.okioki_sent_at),
      sendWithCc: (to) => sendMail(to, d.number, pdf, "pdf", label, invoiceMailWithCc(to, d.number, pdf, ubl, label)),
      sendUbl: (to) => sendMail(to, d.number, ubl, "ubl", label),
      record: async (leg) => {
        const { error } = await supabase.from("invoices").update({ [leg === "pdf" ? "pdf_sent_at" : "okioki_sent_at"]: new Date().toISOString() }).eq("id", inv.id);
        if (error) throw new Error(error.message);
      },
    });
    const via = "okioki";
    const to = `${d.customer.email}; cc ${OKIOKI_INVOICE_EMAIL}`;
    const { error } = await supabase.from("invoices").update({ status: "verzonden", sent_via: via, sent_to: to, sent_at: new Date().toISOString(), send_error: null, delivery_lock_until: null }).eq("id", inv.id);
    if (error) throw new Error(error.message);
    return { id: inv.id, ok: true as const, via };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("invoices").update({ status: "fout", send_error: msg, delivery_lock_until: null }).eq("id", inv.id);
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
      // Contract work orders are informational only and never invoiced.
      if (!wo || wo.status !== "afgetekend" || wo.contract_id) continue;
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
    return getInvoicePdfAttachment(context.supabase, data.invoiceId);
  });

/** Only called after admin authorization, using the caller's RLS-scoped client. */
export async function getInvoicePdfAttachment(supabase: any, invoiceId: string) {
  const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
  if (error || !inv) throw new Error('Factuur niet gevonden');
  const { createInvoicePdf } = await import('@/lib/invoice-pdf');
  return { number: inv.number as string, base64: b64(await createInvoicePdf(await pdfData(supabase, inv))) };
}

/** Credit note that reverses an existing invoice; it follows the same invoice numbering. */
export const createCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: inv } = await supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
    if (!inv) throw new Error("Factuur niet gevonden");
    if (inv.kind === "creditnota") throw new Error("Dit is al een creditnota");
    const { data: existing } = await supabase.from("invoices").select("id").eq("credit_for", inv.id).maybeSingle();
    if (existing) throw new Error("Er bestaat al een creditnota voor deze factuur");
    const cn = buildCreditNote({ lines: inv.lines as InvoiceLine[], vatRate: Number(inv.vat_rate), net: Number(inv.net), vat: Number(inv.vat), total: Number(inv.total) });
    const { data: number, error: ne } = await supabase.rpc("next_invoice_number");
    if (ne) throw new Error(ne.message);
    const issue = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await supabase.from("invoices").insert({
      number, work_order_id: inv.work_order_id, issue_date: issue, due_date: issue,
      customer: inv.customer, lines: cn.lines, vat_rate: cn.vatRate, net: cn.net, vat: cn.vat, total: cn.total, paid_amount: 0,
      kind: "creditnota", credit_for: inv.id,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Sends every invoice and credit note as a UBL attachment in one mail to the accountant. */
export const sendAllToAccountant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single();
    const to = s?.accountant_email?.trim();
    if (!to) throw new Error("Vul eerst het e-mailadres van de boekhouder in");
    const { data: rows } = await supabase.from("invoices").select("*").order("number");
    if (!rows?.length) throw new Error("Er zijn nog geen facturen");
    const { invoiceUbl } = await import("@/lib/invoice-ubl");
    const attachments = [];
    for (const inv of rows) {
      const d = await pdfData(supabase, inv);
      const xml = invoiceUbl(d, { senderId: SENDER_PEPPOL_ID, receiverId: peppolIdFromVat(d.customer.vatNumber), pdfBase64: "", creditNote: inv.kind === "creditnota" });
      attachments.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: `${inv.kind === "creditnota" ? "Creditnota" : "Factuur"}-${inv.number}.xml`, contentType: "application/xml", contentBytes: b64(new TextEncoder().encode(xml)) });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    let key: string | null = null;
    for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) break; }
    if (!key) throw new Error("Koppel eerst de mailbox info@riory.be");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const res = await callAsAppUser({
      gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me/sendMail",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: {
        subject: `Alle facturen en creditnota's (${rows.length}) in UBL — Riory`,
        body: { contentType: "Text", content: `In de bijlage vindt u ${rows.length} factuur-/creditnotabestanden in UBL-formaat voor de boekhouding van Riory.` },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments,
      } }) },
      requiredScopes: WERKBON_MAIL_SCOPES,
    });
    if (await appUserReconnectRequired(res)) throw new Error("Koppel de mailbox info@riory.be opnieuw");
    if (!res.ok) throw new Error(`Mail versturen mislukt [${res.status}]: ${await res.text()}`);
    return { sent: rows.length, to };
  });
