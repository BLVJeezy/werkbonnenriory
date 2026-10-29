import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { campaignSchema, consentSchema, eligibleNewsletterRecipient, newsletterTokenHash } from './newsletters';
import { brandedMailHtml } from './mail-html';

export const getNewsletters = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: admin, error: roleError } = await context.supabase.rpc('is_admin_or_marketing');
  if (roleError || !admin) throw new Error('Alleen de beheerder kan nieuwsbrieven beheren.');
  const customers = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await context.supabase.from('customers').select('id,name,email,customer_number').order('name').order('id').range(offset, offset + 999);
    if (error) throw new Error(error.message);
    customers.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const consents = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await context.supabase.from('newsletter_consents').select('customer_id,email,status,evidence,consent_at,updated_at').order('customer_id').range(offset, offset + 999);
    if (error) throw new Error(error.message);
    consents.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { data: campaigns, error } = await context.supabase.from('newsletter_campaigns').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  const byId = new Map(consents.map(c => [c.customer_id, c]));
  const rows = customers.map(c => ({ ...c, consent: byId.get(c.id) ?? null, eligible: eligibleNewsletterRecipient(c, byId.get(c.id)) }));
  return { customers: rows, campaigns: campaigns ?? [], recipients: new Set(rows.filter(c => c.eligible).map(c => c.email?.trim().toLowerCase())).size };
});

export const saveNewsletterConsent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => consentSchema.parse(d)).handler(async ({ data, context }) => {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await context.supabase.rpc('record_newsletter_consent', { p_customer_id: data.customerId, p_status: data.status, p_evidence: data.evidence, p_hash: await newsletterTokenHash(token) });
  if (error) throw new Error(error.message);
  return { unsubscribeUrl: `https://werkbonnenriory.lovable.app/nieuwsbrief/uitschrijven/${token}` };
});

export const saveNewsletterCampaign = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => campaignSchema.parse(d)).handler(async ({ data, context }) => {
  const { data: admin, error: roleError } = await context.supabase.rpc('is_admin_or_marketing');
  if (roleError || !admin) throw new Error('Alleen de beheerder kan nieuwsbrieven beheren.');
  const { id, image_url, ...rest } = data; const fields = { ...rest, image_url: image_url ?? null };
  const query = id ? context.supabase.from('newsletter_campaigns').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id) : context.supabase.from('newsletter_campaigns').insert({ ...fields, created_by: context.userId });
  const { data: saved, error } = await query.select('id').single();
  if (error) throw new Error(error.message);
  return saved;
});

export const previewNewsletter = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => campaignSchema.parse(d)).handler(async ({ data, context }) => {
  const { data: admin } = await context.supabase.rpc('is_admin_or_marketing');
  if (!admin) throw new Error('Alleen beheerder');
  return { html: brandedMailHtml(`${data.body}\n\nU ontvangt deze nieuwsbrief omdat u toestemming gaf.\nUitschrijven: https://werkbonnenriory.lovable.app/nieuwsbrief/uitschrijven/voorbeeld`, 'info@riory.be', data.image_url?.replace('https://werkbonnenriory.lovable.app', '')) };
});

export const newsletterHistory = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(d => z.object({ customerId: z.string().uuid() }).parse(d)).handler(async ({ data, context }) => {
  const { data: admin } = await context.supabase.rpc('is_admin_or_marketing');
  if (!admin) throw new Error('Alleen beheerder');
  const { data: events, error } = await context.supabase.from('newsletter_consent_events').select('id,status,evidence,created_at').eq('customer_id', data.customerId).order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return events ?? [];
});

export const unsubscribeNewsletter = createServerFn({ method: 'POST' }).inputValidator(d => z.object({ token: z.string().regex(/^[a-f0-9-]{72}$/) }).parse(d)).handler(async ({ data }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: ok, error } = await supabaseAdmin.rpc('unsubscribe_newsletter', { p_hash: await newsletterTokenHash(data.token) });
  if (error) throw new Error('Uitschrijven is niet gelukt. Probeer opnieuw.');
  return { ok: !!ok };
});