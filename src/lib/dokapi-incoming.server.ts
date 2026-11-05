// Processes one incoming Peppol document from Dokapi: download, parse, store as purchase invoice, confirm.
// Used by the public webhook route; runs with the admin client because there is no user session there.
import { confirmIncomingDocument, downloadIncomingDocument } from './dokapi';

export async function processIncomingDokapiDocument(supabase: any, ulid: string): Promise<'imported' | 'skipped'> {
  const { data: exists } = await supabase.from('purchase_invoices').select('id').eq('dokapi_document_id', ulid).maybeSingle();
  if (exists) { await confirmIncomingDocument(ulid).catch(() => null); return 'skipped'; }
  const xml = await downloadIncomingDocument(ulid);
  const { parsePurchaseUbl } = await import('./purchase-booking');
  const p = parsePurchaseUbl(xml) as ReturnType<typeof parsePurchaseUbl> & { supplierBic?: string };
  let path: string | null = null;
  if (p.pdfBase64) {
    path = `peppol/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage.from('aankoopfacturen').upload(path, Uint8Array.from(atob(p.pdfBase64), c => c.charCodeAt(0)), { contentType: 'application/pdf' });
    if (error) path = null;
  }
  const { data: row, error } = await supabase.from('purchase_invoices').insert({
    supplier_name: p.supplierName, supplier_vat: p.supplierVat, supplier_iban: p.supplierIban, supplier_bic: p.supplierBic ?? null, kind: p.kind,
    invoice_number: p.invoiceNumber, invoice_date: p.invoiceDate, due_date: p.dueDate, lines: p.lines,
    net: p.net, vat: p.vat, total: p.total, payment_ref: p.paymentRef, source: 'peppol', status: 'te_controleren',
    pdf_path: path, dokapi_document_id: ulid,
  }).select('supplier_id').single();
  if (error) throw new Error(error.message);
  if (p.supplierBic && row?.supplier_id) await supabase.from('suppliers').update({ bic: p.supplierBic }).eq('id', row.supplier_id).is('bic', null);
  await confirmIncomingDocument(ulid);
  return 'imported';
}
