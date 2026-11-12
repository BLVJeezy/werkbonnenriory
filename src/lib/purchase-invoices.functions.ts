import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePurchaseInvoice, type ParsedPurchaseInvoice } from "@/lib/purchase-invoice";
import { canExportPurchase } from '@/lib/purchase-payment';
import { paymentCommunication, creditorBank } from '@/lib/purchase-booking';
import { syncSupplierPaymentMethod } from './supplier-payment';

type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen voor beheerder");
}

/** Manual trigger: Peppol first, then the accounting mailbox. */
export const importPurchaseInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const lovableKey = process.env['LOVABLE_API_KEY'];
    if (!lovableKey) throw new Error("AI-koppeling ontbreekt");
    const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { INVOICE_MAILBOX_KEY } = await import("@/lib/mail-senders");
    const key = await getConnectionKeyForUser(context.userId, INVOICE_MAILBOX_KEY);
    if (!key) throw new Error("Koppel eerst de mailbox boekhouding@riory.be bij Facturen");
    const { importPurchaseInvoicesFromMail } = await import("@/lib/purchase-import.server");
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    return importPurchaseInvoicesFromMail(supabaseAdmin, key, lovableKey);
  });

/** Admin corrects the parsed values before approving. */
export const updatePurchaseInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; kind?: 'factuur' | 'creditnota'; paymentMethod?: string; supplierId?: string | null; syncSupplier?: boolean } & Partial<ParsedPurchaseInvoice>) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let supplier: { id: string; name: string; vat_number: string | null; iban: string | null; bic: string | null; payment_method: string } | null = null;
    if (data.supplierId) {
      const { data: sup } = await context.supabase.from('suppliers').select('id,name,vat_number,iban,bic,payment_method').eq('id', data.supplierId).single();
      if (!sup) throw new Error('Leverancier niet gevonden');
      supplier = sup;
      // What the admin typed on this invoice wins; the supplier record only fills the gaps.
      data = { ...data, supplierName: sup.name, supplierVat: data.supplierVat || sup.vat_number, supplierIban: data.supplierIban || sup.iban, supplierBic: data.supplierBic || sup.bic, paymentMethod: data.paymentMethod ?? sup.payment_method } as typeof data;
    }
    if (data.kind && !['factuur', 'creditnota'].includes(data.kind)) throw new Error('Ongeldig documenttype');
    if (data.paymentMethod && !['overschrijving','domiciliering','kaart','cash'].includes(data.paymentMethod)) throw new Error('Ongeldige betaalwijze');
    const n = normalizePurchaseInvoice({
      supplierName: data.supplierName, supplierVat: data.supplierVat, supplierIban: data.supplierIban, supplierBic: data.supplierBic,
      invoiceNumber: data.invoiceNumber, invoiceDate: data.invoiceDate, dueDate: data.dueDate,
      lines: data.lines, net: data.net, vat: data.vat, total: data.total, paymentRef: data.paymentRef,
    });
    const { error } = await context.supabase.from("purchase_invoices").update({
      supplier_name: n.supplierName, supplier_vat: n.supplierVat, supplier_iban: n.supplierIban, supplier_bic: n.supplierBic,
      invoice_number: n.invoiceNumber, invoice_date: n.invoiceDate, due_date: n.dueDate,
      lines: n.lines, net: n.net, vat: n.vat, total: n.total, payment_ref: n.paymentRef,
      ...(data.kind ? { kind: data.kind } : {}),
      ...(data.paymentMethod ? { payment_method: data.paymentMethod } : {}),
    }).eq("id", data.id).neq('status', 'betaald');
    if (error) throw new Error(error.message);
    // A corrected bank detail is kept in the supplier list too, so it never has to be typed again.
    let supplierSynced = false;
    let supplierSyncError: string | null = null;
    if (supplier && data.syncSupplier !== false) {
      const patch: { vat_number?: string; iban?: string; bic?: string; payment_method?: string } = {};
      for (const [col, val] of [['vat_number', n.supplierVat], ['iban', n.supplierIban], ['bic', n.supplierBic]] as const) {
        if (val && supplier[col] !== val) patch[col] = val;
      }
      if (data.paymentMethod && data.paymentMethod !== supplier.payment_method) patch.payment_method = data.paymentMethod;
      if (Object.keys(patch).length) {
        const { error: supErr } = await context.supabase.from('suppliers').update(patch).eq('id', supplier.id);
        if (supErr) supplierSyncError = supErr.message;
        else supplierSynced = true;
      }
      if (!supplierSyncError && data.paymentMethod) {
        try {
          await syncSupplierPaymentMethod(context.supabase, supplier.id, data.paymentMethod);
        } catch (error) {
          supplierSyncError = error instanceof Error ? error.message : 'Betaalwijze niet overgenomen op de andere facturen';
        }
      }
    }
    return { ok: true as const, supplierSynced, supplierSyncError };
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
  .inputValidator((i: { ids: string[]; onDueDate?: boolean }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
    // Banks reject past execution dates: overdue invoices (or "as soon as possible") go out today.
    const execDate = (due: string) => data.onDueDate === false || due < today ? today : due;
    const { data: rows, error } = await context.supabase.from("purchase_invoices").select("*").in("id", data.ids.slice(0, 200));
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Geen facturen geselecteerd");
    const notApproved = rows.filter((r: any) => !canExportPurchase({ ...r, total: Number(r.total) }));
    if (notApproved.length) throw new Error("Enkel goedgekeurde facturen met betaalwijze overschrijving kunnen in een betaalbestand (domiciliëring, kaart en cash nooit)");
    const { data: sups } = await context.supabase.from('suppliers').select('id,iban,bic').in('id', rows.map((r: any) => r.supplier_id).filter(Boolean));
    const supById = new Map((sups ?? []).map((x: any) => [x.id, x]));
    const bankOf = (r: any) => creditorBank(r, supById.get(r.supplier_id) as any);
    const missing = rows.filter((r: any) => !bankOf(r).iban || !r.due_date || !(Number(r.total) > 0));
    if (missing.length) throw new Error(`Onvolledige facturen: ${missing.map((r: any) => r.invoice_number ?? r.supplier_name).join(", ")} (IBAN, vervaldag en bedrag vereist)`);
    const { data: s } = await context.supabase.from("settings").select("company_name, company_iban, company_bic").eq("id", 1).single();
    if (!s?.company_iban) throw new Error("Vul eerst het IBAN van Riory in bij de factuurinstellingen");
    const { buildPain001 } = await import("@/lib/pain001");
    const messageId = `RIORY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    const xml = buildPain001(
      { name: s.company_name ?? "Riory bv", iban: s.company_iban, bic: s.company_bic ?? null },
      rows.map((r: any, i: number) => ({
        creditorName: r.supplier_name, creditorIban: bankOf(r).iban as string, creditorBic: bankOf(r).bic, amount: Number(r.total),
        remittance: paymentCommunication(r.payment_ref, r.invoice_number),
        executionDate: execDate(r.due_date), endToEndId: `${messageId}-${i + 1}`,
      })),
      messageId,
    );
    const { error: upErr } = await context.supabase.from("purchase_invoices").update({ status: "betaling_klaargezet", payment_file_at: new Date().toISOString() }).in("id", rows.map((r: any) => r.id)).eq('status', 'goedgekeurd');
    if (upErr) throw new Error(upErr.message);
    return { filename: `betalingen-${messageId}.xml`, xml };
  });

/** Admin removes duplicate/wrong purchase invoices; paid or payment-staged ones are protected. */
export const deletePurchaseInvoices = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { ids: string[] }) => { if (!i.ids?.length) throw new Error('Niets geselecteerd'); return { ids: i.ids.slice(0, 200) }; })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.from('purchase_invoices').select('id,pdf_path,status,booked_at').in('id', data.ids);
    if (error) throw new Error(error.message);
    const ok = (rows ?? []).filter((r: any) => !['betaald', 'betaling_klaargezet'].includes(r.status));
    if (!ok.length) throw new Error('Betaalde of klaargezette facturen kunnen niet verwijderd worden');
    const { error: delErr } = await context.supabase.from('purchase_invoices').delete().in('id', ok.map((r: any) => r.id));
    if (delErr) throw new Error(delErr.message);
    const paths = ok.map((r: any) => r.pdf_path).filter(Boolean);
    if (paths.length) await context.supabase.storage.from('aankoopfacturen').remove(paths);
    return { deleted: ok.length, skipped: (rows?.length ?? 0) - ok.length };
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

export const importReceipt = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: { base64: string; mime: string; filename: string }) => {
    if (!i.base64 || i.base64.length > 14000000 || !['application/pdf','image/jpeg','image/png','image/webp'].includes(i.mime)) throw new Error('Kies een PDF, JPG, PNG of WebP van maximaal 10 MB.');
    return i;
  }).handler(async ({ data, context }) => {
    await assertAdmin(context);
    const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    const prefix = new TextDecoder().decode(bytes.slice(0, 5));
    const valid = data.mime === 'application/pdf' ? prefix === '%PDF-' : data.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : data.mime === 'image/png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : prefix.startsWith('RIFF') && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
    if (!valid || bytes.length > 10000000) throw new Error('Bestandstype of bestandsgrootte ongeldig.');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2,'0')).join('');
    const { data: existing } = await context.supabase.from('purchase_invoices').select('id').eq('upload_hash', hash).maybeSingle();
    if (existing) return { id: existing.id, duplicate: true, unread: false };
    const ext = data.mime === 'application/pdf' ? 'pdf' : data.mime.split('/')[1];
    const path = `tickets/${crypto.randomUUID()}.${ext}`;
    const storage = context.supabase.storage.from('aankoopfacturen');
    const { error: uploadError } = await storage.upload(path, bytes, { contentType: data.mime });
    if (uploadError) throw new Error('Origineel document opslaan mislukt');
    // Sla het document altijd eerst op als "te_controleren", zodat een scan nooit verloren gaat —
    // ook wanneer de AI-uitlezing mislukt. De beheerder vult dan zelf aan.
    const { data: row, error } = await context.supabase.from('purchase_invoices').insert({
      lines: [], source: 'kasticket', status: 'te_controleren', pdf_path: path, upload_hash: hash,
    }).select('id').single();
    if (error || !row) { await storage.remove([path]); throw new Error(error?.code === '23505' ? 'Dit kasticket is al ingelezen.' : 'Aankoopdocument opslaan mislukt'); }
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) return { id: row.id, duplicate: false, unread: true };
    try {
      const { extractReceipt } = await import('./receipt.server');
      const n = await extractReceipt(key, data.base64, data.mime);
      const { error: readError } = await context.supabase.from('purchase_invoices').update({
        supplier_name: n.supplierName, supplier_vat: n.supplierVat, supplier_iban: n.supplierIban, supplier_bic: n.supplierBic,
        invoice_number: n.invoiceNumber, invoice_date: n.invoiceDate, due_date: n.dueDate,
        lines: n.lines, net: n.net, vat: n.vat, total: n.total, payment_ref: n.paymentRef,
      }).eq('id', row.id);
      if (readError) return { id: row.id, duplicate: false, unread: true };
      return { id: row.id, duplicate: false, unread: false };
    } catch {
      return { id: row.id, duplicate: false, unread: true };
    }
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
