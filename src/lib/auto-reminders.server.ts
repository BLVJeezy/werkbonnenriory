import type { Json } from '@/integrations/supabase/types';
import { brandedBody } from './mail-html';
import { brusselsDate, buildReminder, type ReminderInvoice } from './payment-reminders';

const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/**
 * Sends the free first reminder (stage 1) automatically once the due date has passed.
 * Stages 2 and 3 carry fees and legal consequences, so they stay a manual admin decision.
 * Any existing reminder row (accepted, uncertain or in progress) blocks a new automatic one.
 */
export async function processAutoReminders(supabaseAdmin: any) {
  const today = brusselsDate();
  const { data: settings, error: sErr } = await supabaseAdmin.from('settings').select('*').eq('id', 1).single();
  if (sErr || !settings) throw new Error(sErr?.message ?? 'Instellingen ontbreken');
  const { data: invoices, error } = await supabaseAdmin.from('invoices').select('*')
    .neq('kind', 'creditnota').not('pdf_sent_at', 'is', null).lt('due_date', today).limit(200);
  if (error) throw new Error(error.message);
  const ids = (invoices ?? []).map((i: any) => i.id);
  if (!ids.length) return { checked: 0, sent: [], skipped: [] };
  const [{ data: reminders }, { data: credits }] = await Promise.all([
    supabaseAdmin.from('invoice_reminders').select('invoice_id').in('invoice_id', ids),
    supabaseAdmin.from('invoices').select('credit_for,total').eq('kind', 'creditnota').in('credit_for', ids),
  ]);
  const reminded = new Set((reminders ?? []).map((r: any) => r.invoice_id));
  const candidates = (invoices ?? []).filter((i: any) => !reminded.has(i.id) && Number(i.total) - Number(i.paid_amount) > 0.005);
  if (!candidates.length) return { checked: ids.length, sent: [], skipped: [] };

  const { getConnectionKeyForUser } = await import('./appUserConnections.server');
  const { WERKBON_MAILBOX_KEY } = await import('./werkbon-mailbox.functions');
  const { WERKBON_MAIL_SCOPES } = await import('./outlook-scopes');
  const { data: admins } = await supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin');
  let key: string | null = null; let owner: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) { owner = a.user_id; break; } }
  if (!key || !owner) return { checked: ids.length, sent: [], skipped: [{ reason: 'Mailbox info@riory.be niet gekoppeld' }] };

  const [{ createReminderPdf }, { getInvoicePdfAttachment }, { callAsAppUser, appUserReconnectRequired }, { prepareDocument }, { linkText }] = await Promise.all([
    import('./payment-reminder-pdf'), import('./invoice-sending.server'), import('@/integrations/lovable/appUserConnector'),
    import('./document-tracking.server'), import('./document-tracking'),
  ]);
  const sent: string[] = []; const skipped: { number: string; reason: string }[] = [];
  for (const inv of candidates.slice(0, 20)) {
    let document;
    try {
      const creditAmount = (credits ?? []).filter((c: any) => c.credit_for === inv.id).reduce((s: number, c: any) => s + Math.abs(Number(c.total)), 0);
      const customer = inv.customer as ReminderInvoice['customer'];
      document = buildReminder({ invoice: inv as ReminderInvoice, history: [], creditAmount, stage: 1,
        debtorKind: customer?.vatNumber?.trim() ? 'business' : 'consumer', today, termsAccepted: false, undisputed: true,
        companyName: settings.company_name, companyVat: settings.company_vat, iban: settings.company_iban ?? '' });
    } catch (e) { skipped.push({ number: inv.number, reason: e instanceof Error ? e.message : String(e) }); continue; }
    const pdf = b64(await createReminderPdf(document));
    const original = await getInvoicePdfAttachment(supabaseAdmin, inv.id);
    const { data: claim, error: cErr } = await supabaseAdmin.from('invoice_reminders').insert({ invoice_id: inv.id, stage: 1, created_by: owner, recipient: document.recipient, document: document as unknown as Json }).select('id').single();
    if (cErr || !claim) { skipped.push({ number: inv.number, reason: cErr?.message ?? 'claim mislukt' }); continue; }
    try {
      const tracking = await prepareDocument('herinnering', inv.id, `Herinnering 1 · ${document.number}`, document.recipient, pdf);
      await tracking.send(async () => {
        const res = await callAsAppUser({ gatewayBaseUrl: 'https://connector-gateway.lovable.dev', connectionAPIKey: key!, connectorId: 'microsoft_outlook', path: '/me/sendMail', requiredScopes: WERKBON_MAIL_SCOPES,
          init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: {
            subject: document.subject, body: brandedBody(linkText(document.body, tracking.url)),
            toRecipients: [{ emailAddress: { address: document.recipient } }],
            attachments: [
              { '@odata.type': '#microsoft.graph.fileAttachment', name: `Herinnering-1-${document.number}.pdf`, contentType: 'application/pdf', contentBytes: pdf },
              { '@odata.type': '#microsoft.graph.fileAttachment', name: `Factuur-${document.number}.pdf`, contentType: 'application/pdf', contentBytes: original.base64 },
            ] }, saveToSentItems: true }) } });
        if (await appUserReconnectRequired(res)) throw new Error('Koppel info@riory.be opnieuw.');
        if (!res.ok) throw new Error(`Outlook [${res.status}]: ${await res.text()}`);
      });
      await supabaseAdmin.from('invoice_reminders').update({ status: 'accepted', sent_at: new Date().toISOString() }).eq('id', claim.id);
      sent.push(inv.number);
    } catch (e) {
      // Uncertain outcome: never retried automatically; admin reviews it.
      await supabaseAdmin.from('invoice_reminders').update({ status: 'uncertain', error: e instanceof Error ? e.message : String(e) }).eq('id', claim.id);
      skipped.push({ number: inv.number, reason: 'Verzending onzeker' });
    }
  }
  return { checked: ids.length, sent, skipped };
}
