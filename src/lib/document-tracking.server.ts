import { documentLink, tokenHash, type DocumentType } from './document-tracking';

/** Caller must have authorized access to the source document before invoking. */
export async function prepareDocument(type: DocumentType, id: string, label: string, recipient: string, pdf: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const token = crypto.randomUUID() + crypto.randomUUID();
  const { data, error } = await supabaseAdmin.from('document_deliveries').insert({
    document_type: type, document_id: id, label, recipient, token_hash: await tokenHash(token), pdf_base64: pdf,
  }).select('id').single();
  if (error || !data) throw new Error('Documentlink kon niet voorbereid worden. Er is geen mail verstuurd.');
  return {
    url: documentLink(token),
    async send(action: () => Promise<void>) {
      let accepted = false;
      try {
        await action(); accepted = true;
        const { error: saveError } = await supabaseAdmin.from('document_deliveries').update({ status: 'accepted', sent_at: new Date().toISOString() }).eq('id', data.id);
        if (saveError) console.error('Documentrapport opslaan mislukt', saveError.code);
      } catch (e) {
        await supabaseAdmin.from('document_deliveries').update({ status: accepted ? 'accepted' : 'uncertain' }).eq('id', data.id);
        throw e;
      }
    },
  };
}