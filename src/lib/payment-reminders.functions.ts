import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { brusselsDate, buildReminder, type ReminderInvoice } from './payment-reminders';

const input = z.object({ invoiceId: z.string().uuid(), stage: z.union([z.literal(1), z.literal(2), z.literal(3)]), debtorKind: z.enum(['consumer', 'business']), termsAccepted: z.boolean(), undisputed: z.boolean() });
type Input = z.infer<typeof input>;
type Ctx = { supabase: SupabaseClient<Database>; userId: string };
async function admin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc('has_role', { _user_id: ctx.userId, _role: 'admin' });
  if (error || !data) throw new Error('Alleen voor beheerder.');
}
async function documentFor(ctx: Ctx, i: Input) {
  const [inv, settings, credit, history] = await Promise.all([
    ctx.supabase.from('invoices').select('*').eq('id', i.invoiceId).single(),
    ctx.supabase.from('settings').select('*').eq('id', 1).single(),
    ctx.supabase.from('invoices').select('total').eq('credit_for', i.invoiceId).eq('kind', 'creditnota'),
    ctx.supabase.from('invoice_reminders').select('*').eq('invoice_id', i.invoiceId).order('stage'),
  ]);
  for (const result of [inv, settings, credit, history]) { if (result.error) throw new Error(result.error.message); }
  if (!inv.data || !settings.data) throw new Error('Factuur of instellingen ontbreken.');
  const s = settings.data;
  return buildReminder({ invoice: inv.data as unknown as ReminderInvoice, history: history.data ?? [],
    creditAmount: (credit.data ?? []).reduce((sum, c) => sum + Math.abs(Number(c.total)), 0),
    ...i, today: brusselsDate(), companyName: s.company_name, companyVat: s.company_vat, iban: s.company_iban ?? '' });
}
const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
async function fingerprint(d: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(d)));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export const previewPaymentReminder = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(i => input.parse(i)).handler(async ({ data, context }) => {
  await admin(context);
  const document = await documentFor(context, data);
  const { createReminderPdf } = await import('./payment-reminder-pdf');
  return { document, fingerprint: await fingerprint(document), base64: b64(await createReminderPdf(document)) };
});

export const sendPaymentReminder = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(i => input.extend({ fingerprint: z.string().length(64) }).parse(i)).handler(async ({ data, context }) => {
  await admin(context);
  const document = await documentFor(context, data);
  if (await fingerprint(document) !== data.fingerprint) throw new Error('Saldo of gegevens gewijzigd. Open opnieuw het voorbeeld vóór verzending.');
  // Mail connection/PDF preflight occurs before claiming, so failures here are safe to try again.
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { getConnectionKeyForUser } = await import('./appUserConnections.server');
  const { WERKBON_MAILBOX_KEY } = await import('./werkbon-mailbox.functions');
  const { WERKBON_MAIL_SCOPES } = await import('./outlook-scopes');
  const { data: admins, error: adminsError } = await supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin');
  if (adminsError) throw new Error(adminsError.message);
  let key: string | null = null;
  for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) break; }
  if (!key) throw new Error('Koppel eerst de mailbox info@riory.be.');
  const [{ createReminderPdf }, { getInvoicePdfAttachment }, { callAsAppUser, appUserReconnectRequired }] = await Promise.all([
    import('./payment-reminder-pdf'), import('./invoices.functions'), import('@/integrations/lovable/appUserConnector'),
  ]);
  const pdf = b64(await createReminderPdf(document));
  const original = await getInvoicePdfAttachment(context.supabase, data.invoiceId);
  // Re-read directly before claiming; uniqueness makes repeated/concurrent requests one-time.
  if (await fingerprint(await documentFor(context, data)) !== data.fingerprint) throw new Error('Factuur gewijzigd. Open het voorbeeld opnieuw.');
  const { data: claim, error } = await supabaseAdmin.from('invoice_reminders').insert({ invoice_id: data.invoiceId, stage: data.stage, created_by: context.userId, recipient: document.recipient, document: document as unknown as Json }).select('id').single();
  if (error || !claim) throw new Error(error?.code === '23505' ? 'Deze herinnering is al verzonden of wordt verwerkt.' : error?.message ?? 'Verzendregistratie mislukt.');
  let accepted = false;
  try {
    const res = await callAsAppUser({ gatewayBaseUrl: 'https://connector-gateway.lovable.dev', connectionAPIKey: key, connectorId: 'microsoft_outlook', path: '/me/sendMail', requiredScopes: WERKBON_MAIL_SCOPES,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: {
        subject: document.subject, body: { contentType: 'Text', content: document.body },
        toRecipients: [{ emailAddress: { address: document.recipient } }],
        attachments: [
          { '@odata.type': '#microsoft.graph.fileAttachment', name: `Herinnering-${data.stage}-${document.number}.pdf`, contentType: 'application/pdf', contentBytes: pdf },
          { '@odata.type': '#microsoft.graph.fileAttachment', name: `Factuur-${document.number}.pdf`, contentType: 'application/pdf', contentBytes: original.base64 },
        ],
      }, saveToSentItems: true }) } });
    if (await appUserReconnectRequired(res)) throw new Error('Koppel info@riory.be opnieuw; controleer eerst de verzonden berichten.');
    if (!res.ok) throw new Error(`Outlook [${res.status}]: ${await res.text()}`);
    accepted = true;
    const { error: saveError } = await supabaseAdmin.from('invoice_reminders').update({ status: 'accepted', sent_at: new Date().toISOString() }).eq('id', claim.id);
    if (saveError) throw new Error('Mail aanvaard, maar registratie mislukt. Controleer Outlook en verzend niet opnieuw.');
    return { recipient: document.recipient };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from('invoice_reminders').update({ status: 'uncertain', error: message }).eq('id', claim.id);
    throw new Error(`${accepted ? 'Outlook heeft de mail aanvaard.' : 'Verzending niet bevestigd.'} ${message} Controleer Verzonden items in info@riory.be vóór verdere stappen.`);
  }
});