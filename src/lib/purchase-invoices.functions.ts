import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePurchaseInvoice, type ParsedPurchaseInvoice } from "@/lib/purchase-invoice";
import { canExportPurchase } from '@/lib/purchase-payment';

type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen voor beheerder");
}

/** Manual trigger: read the "Aankoopfacturen" folder of the info mailbox now. */
export const importPurchaseInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const lovableKey = process.env['LOVABLE_API_KEY'];
    if (!lovableKey) throw new Error("AI-koppeling ontbreekt");
    const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { WERKBON_MAILBOX_KEY } = await import("@/lib/werkbon-mailbox.functions");
    const key = await getConnectionKeyForUser(context.userId, WERKBON_MAILBOX_KEY);
    if (!key) throw new Error("Koppel eerst de mailbox info@riory.be op de Werkbonnen-pagina");
    const { importPurchaseInvoicesFromMail } = await import("@/lib/purchase-import.server");
    return importPurchaseInvoicesFromMail(context.supabase, key, lovableKey);
  });

/** Admin corrects the parsed values before approving. */
export const updatePurchaseInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; kind?: 'factuur' | 'creditnota' } & Partial<ParsedPurchaseInvoice>) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.kind && !['factuur', 'creditnota'].includes(data.kind)) throw new Error('Ongeldig documenttype');
    const n = normalizePurchaseInvoice({
      supplierName: data.supplierName, supplierVat: data.supplierVat, supplierIban: data.supplierIban,
      invoiceNumber: data.invoiceNumber, invoiceDate: data.invoiceDate, dueDate: data.dueDate,
      lines: data.lines, net: data.net, vat: data.vat, total: data.total, paymentRef: data.paymentRef,
    });
    const { error } = await context.supabase.from("purchase_invoices").update({
      supplier_name: n.supplierName, supplier_vat: n.supplierVat, supplier_iban: n.supplierIban,
      invoice_number: n.invoiceNumber, invoice_date: n.invoiceDate, due_date: n.dueDate,
      lines: n.lines, net: n.net, vat: n.vat, total: n.total, payment_ref: n.paymentRef,
      ...(data.kind ? { kind: data.kind } : {}),
    }).eq("id", data.id).neq('status', 'betaald');
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setPurchaseInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { ids: string[]; status: "te_controleren" | "goedgekeurd" }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("purchase_invoices").update({ status: data.status }).in("id", data.ids.slice(0, 200)).neq('status', 'betaald').neq('status', 'betaling_klaargezet');
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** A payment file is an instruction, never evidence of payment. */
export const paymentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { ids: string[] }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.from("purchase_invoices").select("*").in("id", data.ids.slice(0, 200));
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Geen facturen geselecteerd");
    const notApproved = rows.filter((r: any) => !canExportPurchase({ ...r, total: Number(r.total) }));
    if (notApproved.length) throw new Error("Enkel goedgekeurde facturen kunnen betaald worden");
    const missing = rows.filter((r: any) => !r.supplier_iban || !r.due_date || !(Number(r.total) > 0));
    if (missing.length) throw new Error(`Onvolledige facturen: ${missing.map((r: any) => r.invoice_number ?? r.supplier_name).join(", ")} (IBAN, vervaldag en bedrag vereist)`);
    const { data: s } = await context.supabase.from("settings").select("company_name, company_iban, company_bic").eq("id", 1).single();
    if (!s?.company_iban) throw new Error("Vul eerst het IBAN van Riory in bij de factuurinstellingen");
    const { buildPain001 } = await import("@/lib/pain001");
    const messageId = `RIORY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    const xml = buildPain001(
      { name: s.company_name ?? "Riory bv", iban: s.company_iban, bic: s.company_bic ?? null },
      rows.map((r: any, i: number) => ({
        creditorName: r.supplier_name, creditorIban: r.supplier_iban, amount: Number(r.total),
        remittance: r.payment_ref ?? (r.invoice_number ? `Factuur ${r.invoice_number}` : null),
        executionDate: r.due_date, endToEndId: `${messageId}-${i + 1}`,
      })),
      messageId,
    );
    const { error: upErr } = await context.supabase.from("purchase_invoices").update({ status: "betaling_klaargezet", payment_file_at: new Date().toISOString() }).in("id", rows.map((r: any) => r.id)).eq('status', 'goedgekeurd');
    if (upErr) throw new Error(upErr.message);
    return { filename: `betalingen-${messageId}.xml`, xml };
  });

export const attachPurchasePdf = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; base64: string }) => {
    if (!i.id || i.base64.length > 14000000) throw new Error('Kies een PDF van maximaal 10 MB');
    return i;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase.from('purchase_invoices').select('id').eq('id', data.id).single();
    if (error || !row) throw new Error('Factuur niet gevonden');
    const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    if (new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw new Error('Geen geldig PDF-bestand');
    const path = `${data.id}/${crypto.randomUUID()}.pdf`;
    const storage = context.supabase.storage.from('aankoopfacturen');
    const { error: uploadError } = await storage.upload(path, bytes, { contentType: 'application/pdf' });
    if (uploadError) throw new Error('PDF opslaan mislukt');
    const { error: saveError } = await context.supabase.from('purchase_invoices').update({ pdf_path: path }).eq('id', data.id);
    if (saveError) { await storage.remove([path]); throw new Error('PDF koppelen mislukt'); }
    return { path };
  });

/** Reads unpaid purchase bills from Simpla (read-only API) and adds new ones for admin review. */
export const importPurchasesFromSimpla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const token = process.env['SIMPLA_API_TOKEN'];
    if (!token) throw new Error("Simpla-token ontbreekt");
    const get = async (dataType: string) => {
      const url = new URL("https://app-02.simpla.be/api/");
      url.searchParams.set("token", token); url.searchParams.set("dataType", dataType);
      const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`Simpla ${dataType} mislukt (HTTP ${res.status})`);
      const j = await res.json() as { status?: string; data?: any[] };
      if (j.status !== "OK" || !Array.isArray(j.data)) throw new Error(`Simpla gaf geen geldige ${dataType}`);
      return j.data;
    };
    const [bills, lines, suppliers] = await Promise.all([get("bill_purchase"), get("billline_purchase"), get("supplier")]);
    const { mapSimplaPurchases } = await import("@/lib/simpla");
    const rows = mapSimplaPurchases(bills, lines, suppliers);
    const { data: existing } = await context.supabase.from("purchase_invoices").select("simpla_bill_id").not("simpla_bill_id", "is", null);
    const have = new Set((existing ?? []).map((e: any) => e.simpla_bill_id));
    const fresh = rows.filter((r) => !have.has(r.simpla_bill_id));
    if (fresh.length) {
      const { error } = await context.supabase.from("purchase_invoices").insert(fresh);
      if (error) throw new Error(`Opslaan mislukt: ${error.message}`);
    }
    return { imported: fresh.length, skipped: rows.length - fresh.length };
  });
