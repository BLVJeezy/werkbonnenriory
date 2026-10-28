import { peppolIdFromVat, type InvoiceCustomer, type InvoiceLine } from './invoice';
import type { InvoicePdfData } from './invoice-pdf';
import { WERKBON_MAIL_SCOPES } from './outlook-scopes';
import { INVOICE_MAILBOX_KEY, INVOICE_MAILBOX_ADDRESS, assertInvoiceMailbox } from './mail-senders';
import { getConnectionKeyForUser } from './appUserConnections.server';
import { deliverInvoice,invoiceMail,invoiceMailWithCc,OKIOKI_INVOICE_EMAIL } from './invoice-delivery';
const SENDER_PEPPOL_ID='0208:0840931404';
const b64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

export async function pdfData(supabase: any, inv: any): Promise<InvoicePdfData> {
  const [{ data: s }, { data: wo }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single(),
    inv.work_order_id ? supabase.from("work_orders").select("number").eq("id", inv.work_order_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let extra: { title: string; reference: string } | null = null;
  if (inv.kind === "creditnota") {
    const { data: orig } = inv.credit_for ? await supabase.from("invoices").select("number").eq("id", inv.credit_for).maybeSingle() : { data: null };
    extra = { title: "CREDITNOTA", reference: `Creditnota voor factuur ${orig?.number ?? "onbekend"}` };
  } else if (inv.contract_reference) {
    extra = { title: 'FACTUUR', reference: inv.contract_reference };
  } else if (!wo) {
    extra = { title: 'FACTUUR', reference: 'Directe factuur' };
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

// ---- Mail via the dedicated invoice mailbox ----
async function sendMail(to: string, number: string, contentBytes: string, format: "pdf" | "ubl", label = "Factuur", payload?: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  let key: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, INVOICE_MAILBOX_KEY); if (key) break; }
  if (!key) throw new Error(`Koppel eerst de mailbox ${INVOICE_MAILBOX_ADDRESS}`);
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const profile = await callAsAppUser({ gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me?$select=mail,userPrincipalName", requiredScopes: WERKBON_MAIL_SCOPES });
  if (await appUserReconnectRequired(profile)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
  if (!profile.ok) throw new Error(`Mailbox controleren mislukt [${profile.status}]: ${await profile.text()}`);
  assertInvoiceMailbox(await profile.json());
  const res = await callAsAppUser({
    gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me/sendMail",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload ?? invoiceMail(to, number, contentBytes, format, label)) },
    requiredScopes: WERKBON_MAIL_SCOPES,
  });
  if (await appUserReconnectRequired(res)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
  if (!res.ok) {
    const body = await res.text();
    console.error(`Factuurmail mislukt [${res.status}]: ${body}`);
    throw new Error(`Mail versturen mislukt [${res.status}]: ${body}`);
  }
}

export async function sendOne(supabase: any, inv: any) {
  if (inv.status === "verzonden") return { id: inv.id, ok: true as const, via: inv.sent_via };
  if (inv.contract_id && inv.auto_send_started_at && !inv.pdf_sent_at) return { id: inv.id, ok: false as const, error: 'Verzending onzeker: controleer Verzonden items in Outlook vóór opnieuw verzenden.' };
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
      sendWithCc: async (to) => {
        if (inv.contract_id) {
          const {error}=await supabase.from('invoices').update({auto_send_started_at:new Date().toISOString()}).eq('id',inv.id);
          if(error) throw error;
        }
        const { prepareDocument } = await import('./document-tracking.server');
        const tracking = await prepareDocument(inv.kind === 'creditnota' ? 'creditnota' : 'factuur', inv.id, `${label} ${d.number}`, to, pdf);
        const payload = invoiceMailWithCc(to, d.number, pdf, ubl, label, tracking.url);
        await tracking.send(() => sendMail(to, d.number, pdf, "pdf", label, payload));
      },
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

/** Only called after admin authorization, using the caller's RLS-scoped client. */
export async function getInvoicePdfAttachment(supabase: any, invoiceId: string) {
  const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
  if (error || !inv) throw new Error('Factuur niet gevonden');
  const { createInvoicePdf } = await import('@/lib/invoice-pdf');
  return { number: inv.number as string, base64: b64(await createInvoicePdf(await pdfData(supabase, inv))) };
}

