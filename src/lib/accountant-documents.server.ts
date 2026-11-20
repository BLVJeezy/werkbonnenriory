import { invoiceUbl } from './invoice-ubl';
import { peppolIdFromVat } from './invoice';
import { purchaseUbl, withSourceDocument } from './accountant-package';
import { pdfData } from './invoice-sending.server';

export function bytesBase64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

/** Caller is admin-checked; retain accepted customer PDF snapshots, otherwise render invoice snapshots. */
export async function accountantSalesUbl(supabase: any, inv: any) {
  const d = await pdfData(supabase, inv);
  const { data: snapshot, error } = await supabase.from('document_deliveries').select('pdf_base64')
    .eq('document_id', inv.id).eq('document_type', inv.kind === 'creditnota' ? 'creditnota' : 'factuur')
    .eq('status', 'accepted').order('sent_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Factuur ${inv.number}: opgeslagen PDF ophalen mislukt`);
  const { createInvoicePdf } = await import('./invoice-pdf');
  const pdf = snapshot?.pdf_base64 || bytesBase64(await createInvoicePdf(d));
  return invoiceUbl(d, { senderId: '9925:BE0840931404', receiverId: peppolIdFromVat(d.customer.vatNumber), pdfBase64: pdf, creditNote: inv.kind === 'creditnota' });
}

export async function accountantPurchaseUbl(supabase: any, p: any, buyer: { name: string; vat: string }) {
  const storage = supabase.storage.from('aankoopfacturen');
  const read = async (path: string) => {
    const { data, error } = await storage.download(path);
    if (error || !data) throw new Error(`Origineel document ophalen mislukt: ${p.invoice_number ?? p.supplier_name}`);
    return data as Blob;
  };
  const xml = p.original_ubl_path ? await (await read(p.original_ubl_path)).text()
    : purchaseUbl({ ...p, lines: Array.isArray(p.lines) ? p.lines : [] }, buyer);
  if (!p.pdf_path) throw new Error(`Originele factuur ontbreekt: ${p.invoice_number ?? p.supplier_name}. Voeg eerst het document toe.`);
  const blob = await read(p.pdf_path);
  const mime = blob.type && blob.type !== 'application/octet-stream' ? blob.type : /\.png$/i.test(p.pdf_path) ? 'image/png' : /\.jpe?g$/i.test(p.pdf_path) ? 'image/jpeg' : 'application/pdf';
  return withSourceDocument(xml, { name: p.pdf_path.split('/').pop() ?? 'Factuur.pdf', mime, base64: bytesBase64(new Uint8Array(await blob.arrayBuffer())) });
}