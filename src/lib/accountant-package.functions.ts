import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { peppolIdFromVat } from "@/lib/invoice";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { INVOICE_MAILBOX_KEY, INVOICE_MAILBOX_ADDRESS, assertInvoiceMailbox } from "@/lib/mail-senders";
import { accountantWarnings, elapsedMonths, purchaseUbl } from "@/lib/accountant-package";
import { depreciationByYear, depreciationSchedule, missingDeprParams } from "@/lib/finance";
import { statements, trialBalance, isBalanced } from "@/lib/boekhouding";

type Ctx = { supabase: any; userId: string };
const SENDER_PEPPOL_ID = "0208:0840931404";
const yearInput = (i: { year: number }) => ({ year: Math.min(2100, Math.max(2000, Math.trunc(Number(i?.year) || new Date().getFullYear()))) });

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

async function loadYear(ctx: Ctx, year: number) {
  const { supabase, userId } = ctx;
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const { data: companies } = await supabase.from("companies").select("id,name").eq("user_id", userId);
  const company = (companies ?? []).find((c: any) => /riory/i.test(c.name)) ?? companies?.[0] ?? null;
  const c = company?.id;
  const [sales, purchases, finInv, months, bank, invs, accounts, refs, lines] = await Promise.all([
    fetchAll((a, b) => supabase.from("invoices").select("*").gte("issue_date", from).lte("issue_date", to).order("id").range(a, b)),
    fetchAll((a, b) => supabase.from("purchase_invoices").select("*").gte("invoice_date", from).lte("invoice_date", to).order("id").range(a, b)),
    c ? fetchAll((a, b) => supabase.from("fin_invoices").select("id,review_status,source,source_ref,invoice_date").eq("company_id", c).gte("invoice_date", from).lte("invoice_date", to).order("id").range(a, b)) : [],
    c ? supabase.from("fin_months").select("*").eq("company_id", c).gte("month", from).lte("month", to).then((r: any) => r.data ?? []) : [],
    c ? fetchAll((a, b) => supabase.from("fin_bank_tx").select("*").eq("company_id", c).gte("tx_date", from).lte("tx_date", to).order("id").range(a, b)) : [],
    c ? supabase.from("fin_investments").select("*").eq("company_id", c).then((r: any) => r.data ?? []) : [],
    c ? supabase.from("fin_accounts").select("number,name").eq("company_id", c).then((r: any) => r.data ?? []) : [],
    c ? fetchAll((a, b) => supabase.from("fin_journal_entries").select("source,source_ref").eq("company_id", c).in("source", ["factuur", "simpla"]).order("id").range(a, b)) : [],
    c ? fetchAll((a, b) => supabase.from("fin_journal_lines").select("*, fin_journal_entries!inner(entry_date, journal, description, reference, source)").eq("company_id", c).lte("fin_journal_entries.entry_date", to).order("id").range(a, b)) : [],
  ]);
  const posted = lines.map((l: any) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit), entry_date: l.fin_journal_entries.entry_date, journal: l.fin_journal_entries.journal, source: l.fin_journal_entries.source }));
  const today = new Date().toISOString().slice(0, 10);
  const tb = trialBalance(posted, from, to < today ? to : today);
  const refSet = new Set(refs.map((r: any) => `${r.source}:${r.source_ref}`));
  const monthMap = new Map(months.map((m: any) => [String(m.month).slice(0, 7), m]));
  const yearLines = posted.filter((l: any) => l.entry_date >= from);
  const warnings = accountantWarnings({
    purchasesToCheck: purchases.filter((p: any) => p.status === "te_controleren").length,
    salesUnsent: sales.filter((s: any) => !s.sent_at).length,
    financeToReview: finInv.filter((i: any) => i.review_status === "te_beoordelen").length,
    financeUnbooked: finInv.filter((i: any) => i.review_status !== "te_beoordelen" && !refSet.has(`factuur:${i.id}`) && !(i.source === "simpla" && i.source_ref && refSet.has(`simpla:${i.source_ref}`))).length,
    bankUnbooked: bank.filter((t: any) => !t.entry_id).length,
    monthsIncomplete: c ? elapsedMonths(year, today).filter((m) => { const r: any = monthMap.get(m); return !r || !r.revenue_complete || !r.costs_complete || !r.bank_complete; }) : [],
    investmentsIncomplete: invs.filter((i: any) => missingDeprParams(i).length).map((i: any) => i.name),
    journalLines: yearLines.length,
    trialDiff: isBalanced(yearLines).diff,
  });
  if (!c) warnings.unshift("Er is nog geen bedrijf ingesteld in Boekhouding.");
  return { company, sales, purchases, bank, invs, accounts, tb, yearLines, warnings };
}

export const checkAccountantPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(yearInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const d = await loadYear(context, data.year);
    return { warnings: d.warnings, sales: d.sales.length, purchases: d.purchases.length };
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
    const res = await callAsAppUser({ ...base, path: "/me/sendMail", init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject, body: { contentType: "Text", content }, toRecipients: [{ emailAddress: { address: to } }], attachments } }) } });
    if (await appUserReconnectRequired(res)) throw new Error(`Koppel de mailbox ${INVOICE_MAILBOX_ADDRESS} opnieuw`);
    if (!res.ok) throw new Error(`Mail "${subject}" versturen mislukt [${res.status}]: ${await res.text()}`);
  };
}

/** Mail 1: all sales + purchase documents of the year as UBL. Mail 2: balance, depreciation tables and all ledger records as Excel. */
export const sendAccountantPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(yearInput)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabase } = context;
    const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single();
    const to = s?.accountant_email?.trim();
    if (!to) throw new Error("Vul eerst het e-mailadres van de boekhouder in");
    const d = await loadYear(context, data.year);
    const send = await mailer();

    // ---- Mail 1: UBL ----
    const { invoiceUbl } = await import("@/lib/invoice-ubl");
    const { pdfData } = await import("./invoice-sending.server");
    const ubl: unknown[] = [];
    for (const inv of d.sales) {
      const pd = await pdfData(supabase, inv);
      const xml = invoiceUbl(pd, { senderId: SENDER_PEPPOL_ID, receiverId: peppolIdFromVat(pd.customer.vatNumber), pdfBase64: "", creditNote: inv.kind === "creditnota" });
      ubl.push(file(`Verkoop-${inv.kind === "creditnota" ? "Creditnota" : "Factuur"}-${inv.number}.xml`, "application/xml", b64(xml)));
    }
    const buyer = { name: s?.company_name || "Riory BV", vat: s?.company_vat || "BE0840931404" };
    for (const p of d.purchases) {
      const safe = `${p.supplier_name}-${p.invoice_number ?? p.id.slice(0, 8)}`.replace(/[^\w.-]+/g, "_").slice(0, 80);
      ubl.push(file(`Aankoop-${p.kind === "creditnota" ? "Creditnota" : "Factuur"}-${safe}.xml`, "application/xml", b64(purchaseUbl({ ...p, lines: Array.isArray(p.lines) ? p.lines : [] }, buyer))));
    }
    if (!ubl.length) throw new Error(`Er zijn geen aankoop- of verkoopfacturen in ${data.year}`);
    const warnText = d.warnings.length ? `\n\nOpgelet — de boekhouding is nog niet volledig:\n- ${d.warnings.join("\n- ")}` : "";
    await send(to, `Aankoop- en verkoopfacturen ${data.year} in UBL — Riory`, `In de bijlage vindt u ${d.sales.length} verkoop- en ${d.purchases.length} aankoopdocumenten van ${data.year} in UBL-formaat.${warnText}`, ubl);

    // ---- Mail 2: comparison pack (Excel) ----
    const XLSX = await import("xlsx");
    const names = new Map(d.accounts.map((x: any) => [x.number, x.name]));
    const st = statements(d.tb);
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    add("Controle", [["Controle boekhouding " + data.year], [d.warnings.length ? "NIET VOLLEDIG" : "Volledig"], ...d.warnings.map((w) => [w])]);
    add("Balans", [["Onderdeel", "Bedrag"], ["Activa", st.activa], ["Passiva", st.passiva], ["Opbrengsten", st.opbrengsten], ["Kosten", st.kosten], ["Belastingen", st.belastingen], ["Resultaat", st.resultaat], ["Balans sluit", st.sluit ? "ja" : "nee"]]);
    add("Proef- en saldibalans", [["Rekening", "Naam", "Debet", "Credit", "Saldo"], ...d.tb.map((r) => [r.account, names.get(r.account) ?? "", r.debit, r.credit, r.saldo])]);
    const deprY: unknown[][] = [["Investering", "Jaar", "Maanden", "Boekwaarde begin", "Afschrijving", "Gecumuleerd", "Boekwaarde einde"]];
    const deprM: unknown[][] = [["Investering", "Maand", "Afschrijving", "Gecumuleerd", "Boekwaarde"]];
    for (const i of d.invs) {
      const rows = depreciationSchedule(i);
      for (const y of depreciationByYear(rows)) deprY.push([i.name, y.year, y.months, y.begin, y.depreciation, y.accumulated, y.end]);
      for (const r of rows) deprM.push([i.name, r.month, r.depreciation, r.accumulated, r.bookValue]);
      if (!rows.length) deprY.push([i.name, "", "", "", "", "", missingDeprParams(i).length ? "ontbreekt: " + missingDeprParams(i).join(", ") : "geen schema"]);
    }
    add("Afschrijvingen per jaar", deprY);
    add("Afschrijvingen per maand", deprM);
    add("Dagboeken", [["Datum", "Dagboek", "Omschrijving", "Referentie", "Rekening", "Naam", "Debet", "Credit", "Btw-rooster"], ...d.yearLines.sort((x: any, y: any) => x.entry_date.localeCompare(y.entry_date)).map((l: any) => [l.entry_date, l.journal, l.fin_journal_entries.description ?? "", l.fin_journal_entries.reference ?? "", l.account, names.get(l.account) ?? "", l.debit, l.credit, l.vat_grid ?? ""])]);
    add("Verkoopfacturen", [["Nummer", "Soort", "Datum", "Vervaldag", "Klant", "Netto", "Btw", "Totaal", "Betaald", "Status", "Verzonden"], ...d.sales.map((i: any) => [i.number, i.kind, i.issue_date, i.due_date, i.customer?.name ?? "", Number(i.net), Number(i.vat), Number(i.total), Number(i.paid_amount), i.status, i.sent_at ? "ja" : "nee"])]);
    add("Aankoopfacturen", [["Leverancier", "Nummer", "Soort", "Datum", "Vervaldag", "Netto", "Btw", "Totaal", "Status", "Bron"], ...d.purchases.map((p: any) => [p.supplier_name, p.invoice_number ?? "", p.kind, p.invoice_date, p.due_date, Number(p.net), Number(p.vat), Number(p.total), p.status, p.source])]);
    add("Bank", [["Datum", "Bedrag", "Tegenpartij", "Omschrijving", "Rekening", "Geboekt"], ...d.bank.map((t: any) => [t.tx_date, Number(t.amount), t.counterparty ?? "", t.description ?? "", t.bank_account ?? "", t.entry_id ? "ja" : "nee"])]);
    const xlsx = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
    await send(to, `Boekhouding ${data.year} ter vergelijking — balans, afschrijvingen en stukken — Riory`,
      `In de bijlage vindt u de balans, proef- en saldibalans, afschrijvingstabellen, dagboeken, facturenlijsten en banktransacties van ${data.year} uit onze opvolgboekhouding, ter vergelijking met uw boekhouding.${warnText}`,
      [file(`Boekhouding-Riory-${data.year}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx)]);
    return { to, ubl: ubl.length, warnings: d.warnings };
  });
