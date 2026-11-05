import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, buildCreditNote, buildInvoice, buildManualCreditNote, buildManualInvoice, canInvoiceWorkOrder, invoiceMergeKey, mergeWorkOrderInvoices, isFullyPaid, isInvoiceEditable, peppolIdFromVat, type InvoiceCustomer, type InvoiceLine } from "@/lib/invoice";
import type { InvoicePdfData } from "@/lib/invoice-pdf";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { INVOICE_MAILBOX_KEY, INVOICE_MAILBOX_ADDRESS, assertInvoiceMailbox } from "@/lib/mail-senders";

import { deliverInvoice, invoiceMail, invoiceMailWithCc, OKIOKI_INVOICE_EMAIL } from "@/lib/invoice-delivery";

type Ctx = { supabase: any; userId: string };
const SENDER_PEPPOL_ID = "9925:BE0840931404";

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen voor beheerder");
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
    const created: string[] = [], skipped: (number | null)[] = [];
    let sent = 0, failed = 0;
    // Work orders of the same customer (same VAT rate) go onto one invoice; paid amounts add up so any rest stays payable.
    const { data: prior } = (await supabase.from("invoices").select("*")) as { data: { work_order_id: string | null; extra_work_order_ids?: string[] | null }[] | null };
    const invoiced = new Set<string>();
    for (const p of prior ?? []) { if (p.work_order_id) invoiced.add(p.work_order_id); for (const x of p.extra_work_order_ids ?? []) invoiced.add(x); }
    const groups = new Map<string, { wo: any; inv: ReturnType<typeof buildInvoice> }[]>();
    for (const id of data.workOrderIds) {
      const { data: wo } = await supabase.from("work_orders").select("*").eq("id", id).single();
      // Contract- en "niet factureren"-werkbonnen (bijv. garantie) worden nooit gefactureerd.
      if (!wo || !canInvoiceWorkOrder(wo)) continue;
      if (invoiced.has(id)) { skipped.push(wo.number); continue; }
      const [t, m] = await Promise.all([
        supabase.from("time_entries").select("*").eq("work_order_id", id),
        supabase.from("materials").select("*").eq("work_order_id", id).order("created_at"),
      ]);
      const seconds = (t.data ?? []).reduce((sum: number, e: any) => sum + (e.ended_at ? (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000 : 0), 0);
      const act = (acts ?? []).find((a: any) => a.id === wo.activity_id) ?? null;
      const { data: klant } = wo.customer_id ? await supabase.from("customers").select("billing_email").eq("id", wo.customer_id).maybeSingle() : { data: null };
      const inv = buildInvoice({ wo: { ...wo, customer_billing_email: klant?.billing_email ?? null, distance_km: wo.distance_km == null ? null : Number(wo.distance_km), vat_rate: Number(wo.vat_rate) }, activity: act, seconds, kmRate: Number(s?.km_rate ?? 0), materials: m.data ?? [] });
      const key = invoiceMergeKey(wo);
      groups.set(key, [...(groups.get(key) ?? []), { wo, inv }]);
    }
    for (const parts of groups.values()) {
      const first = parts[0];
      if (!first) continue;
      const merged = mergeWorkOrderInvoices(parts.map((p) => ({ number: p.wo.number, lines: p.inv.lines, net: p.inv.net, vat: p.inv.vat, total: p.inv.total, paidAmount: p.inv.paidAmount })));
      const issue = new Date().toISOString().slice(0, 10);
      // Atomic: number and invoice are created in one transaction, so a failed insert cannot burn a number.
      const { data: row, error } = await supabase.rpc("create_numbered_invoice", {
        p_work_order_id: first.wo.id, p_issue_date: issue, p_due_date: addDays(issue, Number(s?.payment_days ?? 14)),
        p_customer: first.inv.customer, p_lines: merged.lines, p_vat_rate: first.inv.vatRate, p_net: merged.net, p_vat: merged.vat, p_total: merged.total, p_paid_amount: merged.paidAmount,
      });
      if (error) throw new Error(error.message);
      if (parts.length > 1) await supabase.from("invoices").update({ extra_work_order_ids: parts.slice(1).map((p) => p.wo.id) } as never).eq("id", row.id);
      created.push(row.number);
      if (isFullyPaid(merged.total, merged.paidAmount)) { const r = await (await import('./invoice-sending.server')).sendOne(supabase, row); r.ok ? sent++ : failed++; }
    }
    return { created, skipped, sent, failed };
  });

type ManualLine = { description: string; quantity: number; unit: string; unitPrice: number; vatRate: number; discount?: number; group?: string | null; hidePrice?: boolean };

/** Handmade invoice from the "Nieuwe factuur" form: existing customer or free-form customer, own lines, per-line VAT. */
export const createManualInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    customerId?: string | null; customer?: { name: string; street?: string | null; houseNumber?: string | null; postalCode?: string | null; city?: string | null; vatNumber?: string | null; email?: string | null } | null;
    reference?: string | null; note?: string | null; lines: ManualLine[]; creditNote?: boolean;
  }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const rows = data.lines.filter((l) => l.description.trim()).slice(0, 50);
    if (!rows.length) throw new Error("Vul minstens één lijn met omschrijving in");
    // Losse creditnota: zelfde lijnen, bedragen negatief via buildCreditNote; zelfde nummering.
    const calc = data.creditNote ? buildManualCreditNote(rows) : buildManualInvoice(rows);
    let customer: InvoiceCustomer;
    if (data.customerId) {
      const { data: c, error } = await supabase.from("customers").select("*").eq("id", data.customerId).single();
      if (error || !c) throw new Error("Klant niet gevonden");
      customer = { name: c.name, address: null, siteAddress: null, vatNumber: c.vat_number?.trim() || null, email: c.billing_email?.trim() || c.email?.trim() || null, street: c.street, houseNumber: c.house_number, postalCode: c.postal_code, city: c.city };
    } else {
      const m = data.customer;
      if (!m?.name?.trim()) throw new Error("Kies een klant of vul een naam in");
      customer = { name: m.name.trim(), address: null, siteAddress: null, vatNumber: m.vatNumber?.trim() || null, email: m.email?.trim() || null, street: m.street?.trim() || null, houseNumber: m.houseNumber?.trim() || null, postalCode: m.postalCode?.trim() || null, city: m.city?.trim() || null };
    }
    const { data: s } = await supabase.from("settings").select("payment_days").eq("id", 1).single();
    const issue = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await supabase.rpc("create_numbered_invoice", {
      p_work_order_id: null as unknown as string, p_issue_date: issue, p_due_date: addDays(issue, Number(s?.payment_days ?? 14)),
      p_customer: customer, p_lines: calc.lines, p_vat_rate: calc.vatRate, p_net: calc.net, p_vat: calc.vat, p_total: calc.total, p_paid_amount: 0,
      p_kind: data.creditNote ? "creditnota" : "factuur", p_contract_reference: data.reference?.trim() || "",
    });
    if (error) throw new Error(error.message);
    const note = data.note?.trim().slice(0, 4000);
    if (note && row) await supabase.from("invoices").update({ note } as never).eq("id", (row as { id: string }).id);
    return row;
  });

/** Reopens an unsent invoice: replaces customer (optional), reference and lines; number and dates stay. */
export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceId: string; customerId?: string | null; reference?: string | null; note?: string | null; lines: ManualLine[] }) => {
    if (typeof i?.invoiceId !== "string" || !Array.isArray(i.lines)) throw new Error("Ongeldige factuur");
    return i;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: inv } = await supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
    if (!inv) throw new Error("Factuur niet gevonden");
    if (!isInvoiceEditable(inv)) throw new Error(inv.kind === "creditnota" ? "Deze creditnota is al verzonden of verrekend en kan niet meer aangepast worden." : "Deze factuur is al verzonden en kan niet meer aangepast worden. Maak een creditnota.");
    if (inv.delivery_lock_until && new Date(inv.delivery_lock_until) > new Date()) throw new Error("De factuur wordt net verzonden; probeer zo opnieuw.");
    const rows = data.lines.filter((l) => l.description.trim()).slice(0, 80);
    if (!rows.length) throw new Error("Vul minstens één lijn met omschrijving in");
    const calc = (inv as { kind?: string } | null)?.kind === "creditnota" ? buildManualCreditNote(rows) : buildManualInvoice(rows);
    let customer = inv.customer as InvoiceCustomer;
    if (data.customerId) {
      const { data: c } = await supabase.from("customers").select("*").eq("id", data.customerId).single();
      if (!c) throw new Error("Klant niet gevonden");
      customer = { ...customer, name: c.name, vatNumber: c.vat_number?.trim() || null, email: c.billing_email?.trim() || c.email?.trim() || null, street: c.street, houseNumber: c.house_number, postalCode: c.postal_code, city: c.city, address: null };
    }
    const patch: any = { customer, lines: calc.lines, vat_rate: calc.vatRate, net: calc.net, vat: calc.vat, total: calc.total, send_error: null };
    if (data.note !== undefined) patch.note = data.note?.trim().slice(0, 4000) || null;
    if (data.reference !== undefined && (inv.contract_reference !== null || !inv.work_order_id)) patch.contract_reference = data.reference?.trim() || "";
    let query = supabase.from("invoices").update(patch).eq("id", inv.id).neq("status", "verzonden").is("sent_at", null).is("pdf_sent_at", null).is("okioki_sent_at", null).is("post_sent_at", null);
    if (inv.kind === "creditnota") query = query.eq("paid_amount", 0);
    const { data: updated, error } = await query.select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Het document is intussen verzonden of verrekend. Vernieuw de lijst.");
    return { ok: true };
  });

/** Briefpost via bpost: staged until bpost delivers the API credentials (BPOST_API_KEY). */
export const sendInvoiceByPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceId: string }) => { if (typeof i?.invoiceId !== "string") throw new Error("Ongeldige factuur"); return i; })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: inv } = await context.supabase.from("invoices").select("id, customer, post_sent_at").eq("id", data.invoiceId).single();
    if (!inv) throw new Error("Factuur niet gevonden");
    if (inv.post_sent_at) throw new Error("Deze factuur is al per post verstuurd.");
    const c = inv.customer as InvoiceCustomer;
    if (!c.street || !c.postalCode || !c.city) throw new Error("Het postadres van de klant is onvolledig (straat, postcode en plaats nodig).");
    if (!process.env["BPOST_API_KEY"]) throw new Error("Briefpost via bpost is nog niet actief: de API-gegevens van bpost ontbreken nog.");
    throw new Error("Briefpost via bpost wordt geactiveerd zodra bpost de API-gegevens bevestigt.");
  });

export const sendInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceIds: string[] }) => ({ invoiceIds: i.invoiceIds.slice(0, 100) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows } = await context.supabase.from("invoices").select("*").in("id", data.invoiceIds);
    const results = [];
    for (const r of rows ?? []) results.push(await (await import('./invoice-sending.server')).sendOne(context.supabase, r));
    return results;
  });

/** Sends a copy of an already-sent invoice to another address (e.g. the billing e-mail), without changing the invoice. */
export const sendInvoiceCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceId: string; to: string }) => {
    if (typeof i?.invoiceId !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i?.to ?? "")) throw new Error("Ongeldige factuur of e-mailadres");
    return { invoiceId: i.invoiceId, to: i.to.trim() };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: inv } = await context.supabase.from("invoices").select("*").eq("id", data.invoiceId).single();
    if (!inv) throw new Error("Factuur niet gevonden");
    const { pdfData } = await import('./invoice-sending.server');
    const d = await pdfData(context.supabase, inv);
    const label = inv.kind === "creditnota" ? "Creditnota" : "Factuur";
    const { createInvoicePdf } = await import("@/lib/invoice-pdf");
    const b64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
    const pdf = b64(await createInvoicePdf(d));
    const { invoiceUbl } = await import("@/lib/invoice-ubl");
    const { peppolIdFromVat } = await import('./invoice');
    const ubl = b64(new TextEncoder().encode(invoiceUbl(d, { senderId: '0208:0840931404', receiverId: peppolIdFromVat(d.customer.vatNumber), pdfBase64: pdf, creditNote: inv.kind === "creditnota" })));
    const { prepareDocument } = await import('./document-tracking.server');
    const tracking = await prepareDocument(inv.kind === 'creditnota' ? 'creditnota' : 'factuur', inv.id, `${label} ${d.number}`, data.to, pdf);
    const { invoiceMailWithCc, OKIOKI_INVOICE_EMAIL } = await import('./invoice-delivery');
    const { isFullyPaid } = await import("@/lib/invoice");
    const { data: st } = await context.supabase.from("settings").select("peppol_active").eq("id", 1).maybeSingle();
    const peppolActive = Boolean(st?.peppol_active);
    const payload = invoiceMailWithCc(data.to, d.number, pdf, ubl, label, tracking.url, isFullyPaid(d.total, d.paidAmount), !peppolActive);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    const { getConnectionKeyForUser } = await import('./appUserConnections.server');
    const { INVOICE_MAILBOX_KEY, INVOICE_MAILBOX_ADDRESS, assertInvoiceMailbox } = await import('./mail-senders');
    let key: string | null = null;
    for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, INVOICE_MAILBOX_KEY); if (key) break; }
    if (!key) throw new Error(`Koppel eerst de mailbox ${INVOICE_MAILBOX_ADDRESS}`);
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const { WERKBON_MAIL_SCOPES } = await import('./outlook-scopes');
    const profile = await callAsAppUser({ gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me?$select=mail,userPrincipalName", requiredScopes: WERKBON_MAIL_SCOPES });
    if (await appUserReconnectRequired(profile)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
    if (!profile.ok) throw new Error(`Mailbox controleren mislukt [${profile.status}]: ${await profile.text()}`);
    assertInvoiceMailbox(await profile.json());
    await tracking.send(async () => {
      const res = await callAsAppUser({
        gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path: "/me/sendMail",
        init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        requiredScopes: WERKBON_MAIL_SCOPES,
      });
      if (await appUserReconnectRequired(res)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
      if (!res.ok) throw new Error(`Mail versturen mislukt [${res.status}]: ${await res.text()}`);
    });
    return { ok: true as const, to: data.to, okioki: peppolActive ? null : OKIOKI_INVOICE_EMAIL };
  });

export const invoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { invoiceId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return (await import('./invoice-sending.server')).getInvoicePdfAttachment(context.supabase, data.invoiceId);
  });

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
    const issue = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await supabase.rpc("create_numbered_invoice", {
      p_work_order_id: inv.work_order_id as string, p_issue_date: issue, p_due_date: issue,
      p_customer: inv.customer, p_lines: cn.lines, p_vat_rate: cn.vatRate, p_net: cn.net, p_vat: cn.vat, p_total: cn.total, p_paid_amount: 0,
      p_kind: "creditnota", p_credit_for: inv.id,
    });
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
      const d = await (await import('./invoice-sending.server')).pdfData(supabase, inv);
      const xml = invoiceUbl(d, { senderId: SENDER_PEPPOL_ID, receiverId: peppolIdFromVat(d.customer.vatNumber), pdfBase64: "", creditNote: inv.kind === "creditnota" });
      attachments.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: `${inv.kind === "creditnota" ? "Creditnota" : "Factuur"}-${inv.number}.xml`, contentType: "application/xml", contentBytes: btoa(String.fromCharCode(...new TextEncoder().encode(xml))) });
    }
    const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
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
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: {
        subject: `Alle facturen en creditnota's (${rows.length}) in UBL — Riory`,
        body: { contentType: "Text", content: `In de bijlage vindt u ${rows.length} factuur-/creditnotabestanden in UBL-formaat voor de boekhouding van Riory.` },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments,
      } }) },
      requiredScopes: WERKBON_MAIL_SCOPES,
    });
    if (await appUserReconnectRequired(res)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
    if (!res.ok) throw new Error(`Mail versturen mislukt [${res.status}]: ${await res.text()}`);
    return { sent: rows.length, to };
  });
