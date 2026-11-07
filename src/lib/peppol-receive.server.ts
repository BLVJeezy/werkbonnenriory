import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

async function peppyrusCall(path: string, init?: RequestInit) {
  const key = process.env['PEPPYRUS_API_KEY'];
  if (!key) throw new Error('Peppyrus is nog niet gekoppeld.');
  const base = process.env['PEPPYRUS_LIVE'] === 'true' ? 'https://api.peppyrus.be/v1' : 'https://api.test.peppyrus.be/v1';
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'X-Api-Key': key, Accept: 'application/json', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Peppyrus ophalen mislukt (HTTP ${response.status})`);
  return response;
}

/** Shared scheduled/admin import; never sends documents or books invoices. */
export async function receivePeppolInvoices(supabase: SupabaseClient<Database>, call: typeof peppyrusCall = peppyrusCall) {
    const list = await (await call('/message/list?folder=INBOX&confirmed=false&perPage=50')).json() as any;
    const items: any[] = Array.isArray(list) ? list : (list.items ?? list.data ?? []);
    const { parsePurchaseUbl } = await import('./purchase-booking');
    let imported = 0, skipped = 0; const errors: string[] = [];
    for (const it of items) {
      const id = String(it.id);
      const { data: exists } = await supabase.from('purchase_invoices').select('id').eq('peppyrus_message_id', id).maybeSingle();
      if (exists) { skipped++; await call(`/message/${id}/confirm`, { method: 'PATCH' }).catch(() => null); continue; }
      try {
        const msg = await (await call(`/message/${id}`)).json() as any;
        const xml = new TextDecoder().decode(Uint8Array.from(atob(msg.fileContent ?? ''), c => c.charCodeAt(0)));
        const p = parsePurchaseUbl(xml);
        let pdf = p.pdfBase64;
        if (!pdf) { const r = await (await call(`/message/${id}/render?format=pdf`)).json().catch(() => null) as any; pdf = r?.fileContent ?? r?.content ?? null; }
        let path: string | null = null;
        if (pdf) {
          path = `peppol/${crypto.randomUUID()}.pdf`;
          const { error } = await supabase.storage.from('aankoopfacturen').upload(path, Uint8Array.from(atob(pdf), c => c.charCodeAt(0)), { contentType: 'application/pdf' });
          if (error) path = null;
        }
        const ublPath = `peppol/${crypto.randomUUID()}.xml`;
        const { error: ublError } = await supabase.storage.from('aankoopfacturen').upload(ublPath, new TextEncoder().encode(xml), { contentType: 'application/xml' });
        if (ublError) throw new Error(`Originele UBL opslaan mislukt: ${ublError.message}`);
        const { data: result, error } = await supabase.rpc('ingest_purchase_document', { p_document: {
          supplier_name: p.supplierName, supplier_vat: p.supplierVat, supplier_iban: p.supplierIban, supplier_bic: p.supplierBic ?? null, kind: p.kind,
          invoice_number: p.invoiceNumber, invoice_date: p.invoiceDate, due_date: p.dueDate, lines: p.lines,
          net: p.net, vat: p.vat, total: p.total, payment_ref: p.paymentRef, source: 'peppol', status: 'te_controleren',
          pdf_path: path, peppyrus_message_id: id, original_ubl_path: ublPath,
        } });
        const row = result as { action?: string; supplier_id?: string } | null;
        if (error || row?.action === 'skipped') await supabase.storage.from('aankoopfacturen').remove([ublPath, ...(path ? [path] : [])]);
        if (error) throw new Error(error.message);
        if (p.supplierBic && row?.supplier_id) await supabase.from('suppliers').update({ bic: p.supplierBic }).eq('id', row.supplier_id).is('bic', null);
        await call(`/message/${id}/confirm`, { method: 'PATCH' });
        if (row?.action === 'skipped') skipped++; else imported++;
      } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
    }
    return { imported, skipped, errors };
}
