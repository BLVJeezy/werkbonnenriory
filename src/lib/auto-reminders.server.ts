import type { Json } from '@/integrations/supabase/types';
import { brandedBody } from './mail-html';
import { brusselsDate, buildReminder, type ReminderInvoice } from './payment-reminders';

const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/**
 * Sends the next reminder stage automatically: stage 1 after the due date, stages 2 and 3
 * once the previous stage's 15-day term has passed (buildReminder enforces waiting/fees).
 * Any non-accepted reminder row (uncertain or in progress) blocks further automatic steps.
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
    supabaseAdmin.from('invoice_reminders').select('invoice_id,stage,status,sent_at,document').in('invoice_id', ids),
    supabaseAdmin.from('invoices').select('credit_for,total').eq('kind', 'creditnota').in('credit_for', ids),
  ]);
  const historyOf = (id: string) => (reminders ?? []).filter((r: any) => r.invoice_id === id);
  const nextStage = (id: string): 1 | 2 | 3 | null => {
    const h = historyOf(id);
    if (h.some((r: any) => r.status !== 'accepted')) return null;
    const max = Math.max(0, ...h.map((r: any) => Number(r.stage)));
    return max >= 3 ? null : ((max + 1) as 1 | 2 | 3);
  };
  const candidates = (invoices ?? []).filter((i: any) => nextStage(i.id) && Number(i.total) - Number(i.paid_amount) > 0.005);
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
      const history = historyOf(inv.id);
      const stage = nextStage(inv.id)!;
      const prevKind = (history.find((r: any) => r.stage === 1)?.document as any)?.debtorKind;
      document = buildReminder({ invoice: inv as ReminderInvoice, history, creditAmount, stage,
        debtorKind: prevKind ?? (customer?.vatNumber?.trim() ? 'business' : 'consumer'), today, termsAccepted: true, undisputed: true,
        companyName: settings.company_name, companyVat: settings.company_vat, iban: settings.company_iban ?? '' });
    } catch (e) { if (String(e).includes('Wacht tot')) continue; skipped.push({ number: inv.number, reason: e instanceof Error ? e.message : String(e) }); continue; }
    const pdf = b64(await createReminderPdf(document));
    const original = await getInvoicePdfAttachment(supabaseAdmin, inv.id);
    const { data: claim, error: cErr } = await supabaseAdmin.from('invoice_reminders').insert({ invoice_id: inv.id, stage: document.stage, created_by: owner, recipient: document.recipient, document: document as unknown as Json }).select('id').single();
    if (cErr || !claim) { skipped.push({ number: inv.number, reason: cErr?.message ?? 'claim mislukt' }); continue; }
    try {
      const tracking = await prepareDocument('herinnering', inv.id, `${document.stage === 3 ? 'Ingebrekestelling' : `Herinnering ${document.stage}`} · ${document.number}`, document.recipient, pdf);
      await tracking.send(async () => {
        const res = await callAsAppUser({ gatewayBaseUrl: 'https://connector-gateway.lovable.dev', connectionAPIKey: key!, connectorId: 'microsoft_outlook', path: '/me/sendMail', requiredScopes: WERKBON_MAIL_SCOPES,
          init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: {
            subject: document.subject, body: brandedBody(linkText(document.body, tracking.url)),
            toRecipients: [{ emailAddress: { address: document.recipient } }],
            attachments: [
              { '@odata.type': '#microsoft.graph.fileAttachment', name: `${document.stage === 3 ? 'Ingebrekestelling' : `Herinnering-${document.stage}`}-${document.number}.pdf`, contentType: 'application/pdf', contentBytes: pdf },
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
