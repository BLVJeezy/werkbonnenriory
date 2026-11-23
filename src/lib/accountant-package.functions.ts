import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { INVOICE_MAILBOX_KEY, INVOICE_MAILBOX_ADDRESS, assertInvoiceMailbox } from "@/lib/mail-senders";
import { accountantWarnings, attachmentBatches, monthsInPeriod, normalizePeriod, periodLabel, periodSlug } from "@/lib/accountant-package";
import { depreciationByYear, depreciationSchedule, missingDeprParams } from "@/lib/finance";
import { statements, trialBalance, isBalanced } from "@/lib/boekhouding";

type Ctx = { supabase: any; userId: string };
/** The UI sends a start and end date; normalizePeriod explains what is wrong when they are not usable. onlyNew = only documents not yet sent to the accountant. */
const periodInput = (i: { from?: string; to?: string; onlyNew?: boolean }) => ({ ...normalizePeriod(i), onlyNew: i?.onlyNew === true });

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen voor beheerder");
}

async function fetchAll(q: (from: number, to: number) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Everything the accountant mails need for one chosen period. onlyNew limits the UBL mail to documents never sent to the accountant before. */
async function loadPeriod(ctx: Ctx, from: string, to: string, onlyNew: boolean) {
  const { supabase, userId } = ctx;
  const { data: companies } = await supabase.from("companies").select("id,name").eq("user_id", userId).ilike("name", "Riory BV");
  const company = companies?.[0] ?? null;
  const c = company?.id;
  const docQ = (table: string, dateCol: string) => (a: number, b: number) => {
    let q = supabase.from(table).select("*").gte(dateCol, from).lte(dateCol, to).order("id").range(a, b);
    if (onlyNew) q = q.is("accountant_sent_at", null);
    if (table === 'purchase_invoices') q = q.neq('source', 'simpla');
    return q;
  };
  const [sales, purchases, finInv, months, bank, invs, accounts, refs, lines] = await Promise.all([
    fetchAll(docQ("invoices", "issue_date")),
    fetchAll(docQ("purchase_invoices", "invoice_date")),
    c ? fetchAll((a, b) => supabase.from("fin_invoices").select("id,review_status,source,source_ref,invoice_date,number").eq("company_id", c).neq("source", "simpla").gte("invoice_date", from).lte("invoice_date", to).order("id").range(a, b)) : [],
    c ? supabase.from("fin_months").select("*").eq("company_id", c).gte("month", from).lte("month", to).then((r: any) => r.data ?? []) : [],
    c ? fetchAll((a, b) => supabase.from("fin_bank_tx").select("*").eq("company_id", c).gte("tx_date", from).lte("tx_date", to).order("id").range(a, b)) : [],
    c ? supabase.from("fin_investments").select("*").eq("company_id", c).then((r: any) => r.data ?? []) : [],
    c ? supabase.from("fin_accounts").select("number,name").eq("company_id", c).then((r: any) => r.data ?? []) : [],
    c ? fetchAll((a, b) => supabase.from("fin_journal_entries").select("source,source_ref,reference,journal").eq("company_id", c).order("id").range(a, b)) : [],
    c ? fetchAll((a, b) => supabase.from("fin_journal_lines").select("*, fin_journal_entries!inner(entry_date, journal, description, reference, source)").eq("company_id", c).lte("fin_journal_entries.entry_date", to).order("id").range(a, b)) : [],
  ]);
  const posted = lines.map((l: any) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit), entry_date: l.fin_journal_entries.entry_date, journal: l.fin_journal_entries.journal, source: l.fin_journal_entries.source }));
  const today = new Date().toISOString().slice(0, 10);
  const tb = trialBalance(posted, from, to < today ? to : today);
  const refSet = new Set(refs.map((r: any) => `${r.source}:${r.source_ref}`));
  // A document booked under another source label (e.g. a manual correction) still counts as booked when its number appears in a sales, purchase or miscellaneous booking (not a payment).
  const docNumbers = new Set(refs.filter((r: any) => ["aankoop", "verkoop", "divers"].includes(r.journal) && !["bank", "bank-part", "wacht"].includes(r.source) && r.reference).map((r: any) => String(r.reference).trim()));
  const monthMap = new Map(months.map((m: any) => [String(m.month).slice(0, 7), m]));
  const periodLines = posted.filter((l: any) => l.entry_date >= from && l.entry_date <= to);
  const warnings = accountantWarnings({
    purchasesToCheck: purchases.filter((p: any) => p.status === "te_controleren").length,
    salesUnsent: sales.filter((s: any) => !s.sent_at).length,
    financeToReview: finInv.filter((i: any) => i.review_status === "te_beoordelen").length,
    financeUnbooked: finInv.filter((i: any) => i.review_status !== "te_beoordelen" && !refSet.has(`factuur:${i.id}`) && !(i.source_ref && refSet.has(`${i.source}:${i.source_ref}`)) && !(i.number && docNumbers.has(String(i.number).trim()))).length,
    bankUnbooked: bank.filter((t: any) => !t.entry_id).length,
    monthsIncomplete: c ? monthsInPeriod(from, to, today).filter((m) => { const r: any = monthMap.get(m); return !r || !r.revenue_complete || !r.costs_complete || !r.bank_complete; }) : [],
    investmentsIncomplete: invs.filter((i: any) => missingDeprParams(i).length).map((i: any) => i.name),
    journalLines: periodLines.length,
    trialDiff: isBalanced(periodLines).diff,
  });
  if (!c) warnings.unshift("Er is nog geen bedrijf ingesteld in Boekhouding.");
  return { company, sales, purchases, bank, invs, accounts, tb, periodLines, warnings };
}

/** How many documents of the period were already sent to the accountant (for the checkbox explanation). */
async function alreadySentCount(ctx: Ctx, from: string, to: string) {
  const { supabase } = ctx;
  const [s, p] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).gte("issue_date", from).lte("issue_date", to).not("accountant_sent_at", "is", null),
    supabase.from("purchase_invoices").select("id", { count: "exact", head: true }).gte("invoice_date", from).lte("invoice_date", to).not("accountant_sent_at", "is", null),
  ]);
  return (s.count ?? 0) + (p.count ?? 0);
}

export const checkAccountantPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(periodInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const d = await loadPeriod(context, data.from, data.to, data.onlyNew);
    const alreadySent = await alreadySentCount(context, data.from, data.to);
    return { from: data.from, to: data.to, onlyNew: data.onlyNew, warnings: d.warnings, sales: d.sales.length, purchases: d.purchases.length, alreadySent };
  });

const b64 = (s: string) => { const u = new TextEncoder().encode(s); let o = ""; for (let i = 0; i < u.length; i += 8192) o += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(o); };
const file = (name: string, contentType: string, contentBytes: string) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name, contentType, contentBytes });

async function mailer() {
  const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  let key: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, INVOICE_MAILBOX_KEY); if (key) break; }
  if (!key) throw new Error(`Koppel eerst de mailbox ${INVOICE_MAILBOX_ADDRESS}`);
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const base = { gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", requiredScopes: WERKBON_MAIL_SCOPES };
  const profile = await callAsAppUser({ ...base, path: "/me?$select=mail,userPrincipalName" });
  if (await appUserReconnectRequired(profile)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
  if (!profile.ok) throw new Error(`Mailbox controleren mislukt [${profile.status}]: ${await profile.text()}`);
  assertInvoiceMailbox(await profile.json());
  return async (to: string, subject: string, content: string, attachments: unknown[]) => {
    if (new TextEncoder().encode(JSON.stringify(attachments)).length > 2_500_000) {
      // Large UBL keeps the original PDF: upload to an Outlook draft in chunks, then send once.
      const draft = await callAsAppUser({ ...base, path: '/me/messages', init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, body: { contentType: 'Text', content }, toRecipients: [{ emailAddress: { address: to } }] }) } });
      if (!draft.ok) throw new Error('Mailconcept voor grote factuur kon niet aangemaakt worden.');
      const { id } = await draft.json() as { id?: string };
      if (!id) throw new Error('Mailconcept ontbreekt.');
      for (const attachment of attachments) {
        const item = attachment as { name: string; contentBytes: string; contentType: string };
        const bytes = Uint8Array.from(atob(item.contentBytes), c => c.charCodeAt(0));
        const session = await callAsAppUser({ ...base, path: `/me/messages/${encodeURIComponent(id)}/attachments/createUploadSession`, init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ AttachmentItem: { attachmentType: 'file', name: item.name, size: bytes.length, contentType: item.contentType } }) } });
        if (!session.ok) throw new Error('Grote factuurbijlage voorbereiden mislukt; er is niets verstuurd.');
        const { uploadUrl } = await session.json() as { uploadUrl?: string };
        if (!uploadUrl || !uploadUrl.startsWith('https://')) throw new Error('Uploadadres ontbreekt.');
        const chunkSize = 10 * 320 * 1024;
        for (let start = 0; start < bytes.length; start += chunkSize) {
          const end = Math.min(start + chunkSize, bytes.length);
          const uploaded = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${start}-${end - 1}/${bytes.length}` }, body: bytes.slice(start, end), signal: AbortSignal.timeout(60000) });
          if (!uploaded.ok) throw new Error('Grote factuurbijlage uploaden mislukt; het concept is niet verstuurd.');
        }
      }
      const sent = await callAsAppUser({ ...base, path: `/me/messages/${encodeURIComponent(id)}/send`, init: { method: 'POST' } });
      if (!sent.ok) throw new Error('Verzending onzeker: controleer Outlook vóór opnieuw versturen.');
      return;
    }
    const res = await callAsAppUser({ ...base, path: "/me/sendMail", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject, body: { contentType: "Text", content }, toRecipients: [{ emailAddress: { address: to } }], attachments } }) } });
    if (await appUserReconnectRequired(res)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
    if (!res.ok) throw new Error(`Mail "${subject}" versturen mislukt [${res.status}]: ${await res.text()}`);
  };
}

/** Mail 1: all sales + purchase documents of the period as UBL. Mail 2: balance, depreciation tables and all ledger records as Excel. */
export const sendAccountantPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(periodInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single();
    const mailTo = s?.accountant_email?.trim();
    if (!mailTo) throw new Error("Vul eerst het e-mailadres van de boekhouder in");
    const { from, to, onlyNew } = data;
    const label = periodLabel(from, to);
    const d = await loadPeriod(context, from, to, onlyNew);
    const send = await mailer();

    // Prepare every source document before sending anything; no silent omission.
    const { accountantSalesUbl, accountantPurchaseUbl } = await import('./accountant-documents.server');
    const ubl: unknown[] = [];
    const documents: { table: string; id: string; attachment: unknown }[] = [];
    for (const inv of d.sales) {
      const xml = await accountantSalesUbl(supabase, inv);
      const attachment = file(`Verkoop-Factuur-${inv.number}.xml`, "application/xml", b64(xml));
      ubl.push(attachment); documents.push({ table: 'invoices', id: inv.id, attachment });
    }
    const buyer = { name: s?.company_name || "Riory BV", vat: s?.company_vat || "BE0840931404" };
    for (const p of d.purchases) {
      const safe = `${p.supplier_name}-${p.invoice_number ?? p.id.slice(0, 8)}`.replace(/[^\w.-]+/g, "_").slice(0, 80);
      const attachment = file(`Aankoop-${p.kind === "creditnota" ? "Creditnota" : "Factuur"}-${safe}.xml`, "application/xml", b64(await accountantPurchaseUbl(supabase, p, buyer)));
      ubl.push(attachment); documents.push({ table: 'purchase_invoices', id: p.id, attachment });
    }
    if (!ubl.length) throw new Error(onlyNew ? `Alle aankoop- en verkoopfacturen tussen ${label} werden al eerder doorgestuurd naar de boekhouder.` : `Er zijn geen aankoop- of verkoopfacturen tussen ${label}`);
    const warnText = d.warnings.length ? `\n\nOpgelet — de boekhouding is nog niet volledig:\n- ${d.warnings.join("\n- ")}` : "";
    const scopeText = onlyNew ? " (enkel de documenten die u nog niet eerder ontving)" : "";
    const batches = attachmentBatches(documents.map(x => x.attachment));
    for (const [index, batch] of batches.entries()) {
      const included = documents.filter(x => batch.includes(x.attachment));
      await send(mailTo, `Aankoop- en verkoopfacturen ${label} in UBL — Riory (${index + 1}/${batches.length})`, `Dit deel bevat ${included.length} facturen en creditnota's in UBL, met de echte documenten ingesloten${scopeText}.${warnText}`, batch);
      for (const table of ['invoices', 'purchase_invoices'] as const) {
        const ids = included.filter(x => x.table === table).map(x => x.id);
        if (!ids.length) continue;
        const { error } = await supabase.from(table).update({ accountant_sent_at: new Date().toISOString() }).in('id', ids);
        if (error) throw new Error('Mail aanvaard, maar verzendmarkering mislukt. Controleer Outlook vóór opnieuw versturen.');
      }
    }

    // ---- Mail 2: comparison pack (Excel) ----
    const XLSX = await import("xlsx");
    const names = new Map(d.accounts.map((x: any) => [x.number, x.name]));
    const st = statements(d.tb);
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    add("Controle", [["Controle boekhouding " + label], [d.warnings.length ? "NIET VOLLEDIG" : "Volledig"], ...d.warnings.map((w) => [w])]);
    add("Balans", [["Onderdeel", "Bedrag"], ["Activa", st.activa], ["Passiva", st.passiva], ["Opbrengsten", st.opbrengsten], ["Kosten", st.kosten], ["Belastingen", st.belastingen], ["Resultaat", st.resultaat], ["Balans sluit", st.sluit ? "ja" : "nee"]]);
    add("Proef- en saldibalans", [["Rekening", "Naam", "Debet", "Credit", "Saldo"], ...d.tb.map((r) => [r.account, names.get(r.account) ?? "", r.debit, r.credit, r.saldo])]);
    const firstMonth = from.slice(0, 7);
    const lastMonth = to.slice(0, 7);
    const deprY: unknown[][] = [["Investering", "Jaar", "Maanden", "Boekwaarde begin", "Afschrijving", "Gecumuleerd", "Boekwaarde einde"]];
    const deprM: unknown[][] = [["Investering", "Maand", "Afschrijving", "Gecumuleerd", "Boekwaarde"]];
    for (const i of d.invs) {
      const rows = depreciationSchedule(i);
      if (!rows.length) {
        deprY.push([i.name, "", "", "", "", "", missingDeprParams(i).length ? "ontbreekt: " + missingDeprParams(i).join(", ") : "geen schema"]);
        continue;
      }
      const inPeriod = rows.filter((r) => r.month >= firstMonth && r.month <= lastMonth);
      if (!inPeriod.length) continue;
      for (const y of depreciationByYear(inPeriod)) deprY.push([i.name, y.year, y.months, y.begin, y.depreciation, y.accumulated, y.end]);
      for (const r of inPeriod) deprM.push([i.name, r.month, r.depreciation, r.accumulated, r.bookValue]);
    }
    add("Afschrijvingen per jaar", deprY);
    add("Afschrijvingen per maand", deprM);
    add("Dagboeken", [["Datum", "Dagboek", "Omschrijving", "Referentie", "Rekening", "Naam", "Debet", "Credit", "Btw-rooster"], ...d.periodLines.sort((x: any, y: any) => x.entry_date.localeCompare(y.entry_date)).map((l: any) => [l.entry_date, l.journal, l.fin_journal_entries.description ?? "", l.fin_journal_entries.reference ?? "", l.account, names.get(l.account) ?? "", l.debit, l.credit, l.vat_grid ?? ""])]);
    add("Verkoopfacturen", [["Nummer", "Soort", "Datum", "Vervaldag", "Klant", "Netto", "Btw", "Totaal", "Betaald", "Status", "Verzonden"], ...d.sales.map((i: any) => [i.number, i.kind, i.issue_date, i.due_date, i.customer?.name ?? "", Number(i.net), Number(i.vat), Number(i.total), Number(i.paid_amount), i.status, i.sent_at ? "ja" : "nee"])]);
    add("Aankoopfacturen", [["Leverancier", "Nummer", "Soort", "Datum", "Vervaldag", "Netto", "Btw", "Totaal", "Status", "Bron"], ...d.purchases.map((p: any) => [p.supplier_name, p.invoice_number ?? "", p.kind, p.invoice_date, p.due_date, Number(p.net), Number(p.vat), Number(p.total), p.status, p.source])]);
    add("Bank", [["Datum", "Bedrag", "Tegenpartij", "Omschrijving", "Rekening", "Geboekt"], ...d.bank.map((t: any) => [t.tx_date, Number(t.amount), t.counterparty ?? "", t.description ?? "", t.bank_account ?? "", t.entry_id ? "ja" : "nee"])]);
    const xlsx = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
    await send(mailTo, `Boekhouding ${label} ter vergelijking — balans, afschrijvingen en stukken — Riory`,
      `In de bijlage vindt u de balans, proef- en saldibalans, afschrijvingstabellen, dagboeken, facturenlijsten en banktransacties van ${label} uit onze opvolgboekhouding, ter vergelijking met uw boekhouding.${warnText}`,
      [file(`Boekhouding-Riory-${periodSlug(from, to)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx)]);
    return { to: mailTo, period: label, ubl: ubl.length, mails: batches.length + 1, warnings: d.warnings };
  });

/** Send one single sales or purchase document to the accountant as UBL with the real document embedded, and mark it as sent. */
export const sendInvoiceToAccountant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind?: string; id?: string }) => {
    const kind = input?.kind === "purchase" ? "purchase" : input?.kind === "sales" ? "sales" : null;
    const id = String(input?.id ?? "");
    if (!kind || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Kies een geldige factuur");
    return { kind, id } as { kind: "sales" | "purchase"; id: string };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single();
    const mailTo = s?.accountant_email?.trim();
    if (!mailTo) throw new Error("Vul eerst het e-mailadres van de boekhouder in");
    const { accountantSalesUbl, accountantPurchaseUbl } = await import('./accountant-documents.server');
    const send = await mailer();
    let name: string;
    let attachment: unknown;
    if (data.kind === "sales") {
      const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", data.id).single();
      if (error || !inv) throw new Error("Factuur niet gevonden");
      name = `${inv.kind === "creditnota" ? "Creditnota" : "Factuur"} ${inv.number}`;
      attachment = file(`Verkoop-Factuur-${inv.number}.xml`, "application/xml", b64(await accountantSalesUbl(supabase, inv)));
    } else {
      const { data: p, error } = await supabase.from("purchase_invoices").select("*").eq("id", data.id).single();
      if (error || !p) throw new Error("Aankoopfactuur niet gevonden");
      const buyer = { name: s?.company_name || "Riory BV", vat: s?.company_vat || "BE0840931404" };
      const safe = `${p.supplier_name}-${p.invoice_number ?? p.id.slice(0, 8)}`.replace(/[^\w.-]+/g, "_").slice(0, 80);
      name = `Aankoopfactuur ${p.invoice_number ?? ""} van ${p.supplier_name}`;
      attachment = file(`Aankoop-${p.kind === "creditnota" ? "Creditnota" : "Factuur"}-${safe}.xml`, "application/xml", b64(await accountantPurchaseUbl(supabase, p, buyer)));
    }
    await send(mailTo, `${name} in UBL — Riory`, `In de bijlage vindt u ${name} in UBL, met het echte document ingesloten.`, [attachment]);
    const { error } = await supabase.from(data.kind === "sales" ? "invoices" : "purchase_invoices").update({ accountant_sent_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error("Mail aanvaard, maar verzendmarkering mislukt. Controleer Outlook vóór opnieuw versturen.");
    return { to: mailTo, name };
  });
