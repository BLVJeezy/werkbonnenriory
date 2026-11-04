import { brandedMailHtml } from './mail-html';
import { openPixelUrl } from './document-tracking';
import { dueQuoteReminder, quoteReminderText } from './quote-reminders';
import { quoteSigningLink } from './quote-signing-link';

const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/**
 * Sends due quote reminders (7 and 10 days after sending) from info@riory.be.
 * The stage is claimed atomically before sending, so an uncertain mail is never sent twice.
 */
export async function processQuoteReminders(supabaseAdmin: any) {
  const now = new Date();
  const { data: quotes, error } = await supabaseAdmin.from('quotes')
    .select('id, number, kind, status, sent_at, reminder_stage, customer, token, created_at')
    .eq('status', 'verzonden').lt('reminder_stage', 2).not('sent_at', 'is', null).limit(200);
  if (error) throw new Error(error.message);
  const due = (quotes ?? []).map((q: any) => ({ q, stage: dueQuoteReminder(q, now) })).filter((x: any) => x.stage && x.q.customer?.email);
  if (!due.length) return { checked: (quotes ?? []).length, sent: [] };

  const { getConnectionKeyForUser } = await import('./appUserConnections.server');
  const { WERKBON_MAILBOX_KEY } = await import('./werkbon-mailbox.functions');
  const { WERKBON_MAIL_SCOPES } = await import('./outlook-scopes');
  const { callAsAppUser, appUserReconnectRequired } = await import('@/integrations/lovable/appUserConnector');
  const { data: admins } = await supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin');
  let key: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) break; }
  if (!key) return { checked: due.length, sent: [], skipped: 'Mailbox info@riory.be niet gekoppeld' };

  const sent: string[] = [];
  for (const { q, stage } of due.slice(0, 20)) {
    // Claim: alleen als de stap nog niet door een andere run genomen is.
    const { data: claimed } = await supabaseAdmin.from('quotes')
      .update({ reminder_stage: stage, reminder_sent_at: now.toISOString(), reminder_error: null })
      .eq('id', q.id).eq('reminder_stage', stage - 1).eq('status', 'verzonden').select('id');
    if (!claimed?.length) continue;
    const Doc = q.kind === 'verzekering' ? 'Bestek' : 'Offerte';
    const text = quoteReminderText({ stage, kind: q.kind, number: q.number, customerName: q.customer.name, link: quoteSigningLink(q.token), validUntil: addDays(q.created_at.slice(0, 10), 30) });
    try {
      const { prepareDocument } = await import('./document-tracking.server');
      const tracking = await prepareDocument('offerte', q.id, `Herinnering ${stage} · ${Doc.toLowerCase()} ${q.number}`, q.customer.email, '');
      await tracking.send(async () => {
      const res = await callAsAppUser({
        gatewayBaseUrl: 'https://connector-gateway.lovable.dev', connectionAPIKey: key, connectorId: 'microsoft_outlook', path: '/me/sendMail',
        init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: {
          subject: `Herinnering: ${Doc.toLowerCase()} ${q.number} — Riory`,
          body: { contentType: 'HTML', content: brandedMailHtml(text, 'info@riory.be', null, openPixelUrl(tracking.url)) },
          toRecipients: [{ emailAddress: { address: q.customer.email } }],
        } }) },
        requiredScopes: WERKBON_MAIL_SCOPES,
      });
      if (await appUserReconnectRequired(res)) throw new Error('Koppel de mailbox info@riory.be opnieuw');
      if (!res.ok) throw new Error(`Mail versturen mislukt [${res.status}]`);
      });
      sent.push(q.number);
    } catch (e) {
      await supabaseAdmin.from('quotes').update({ reminder_error: e instanceof Error ? e.message : String(e) }).eq('id', q.id);
    }
  }
  return { checked: due.length, sent };
}
