import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { newsletterAiInput, newsletterAiError } from './newsletter-ai';

export const generateNewsletter = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => newsletterAiInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (error || !admin) throw new Error('Alleen de beheerder kan nieuwsbrieven genereren.');
    const { data: settings, error: settingsError } = await context.supabase.from('settings').select('newsletter_ai_denial').eq('id', 1).single();
    if (settingsError) throw new Error('AI-toegang kon niet gecontroleerd worden.');
    if (settings?.newsletter_ai_denial) {
      const blocked = settings.newsletter_ai_denial as { message?: string };
      return { draft: null, error: blocked.message ?? 'AI-toegang is geblokkeerd. Herstel eerst de toegang.', status: 403 };
    }
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) return { draft: null, error: 'Lovable AI is nog niet ingesteld.', status: 401 };
    let failure: ReturnType<typeof newsletterAiError> | undefined;
    try {
      const { generateNewsletterDraft, generateNewsletterImage } = await import('./newsletter-ai.server');
      const { imagePrompt, ...text } = await generateNewsletterDraft(getRequest(), apiKey, data.text, async response => {
        if (response.ok) return;
        const body = await response.clone().json().catch(() => null);
        failure = newsletterAiError(body, response.status);
        if (failure.providerDenied) {
          const { error: persistError } = await context.supabase.from('settings').update({ newsletter_ai_denial: { message: failure.message, status: 403, at: new Date().toISOString() } }).eq('id', 1);
          if (persistError) throw new Error('AI-toegang geweigerd; blokkering kon niet bewaard worden.');
        }
      });
      let image_url: string | null = null;
      let imageError: string | null = null;
      if (imagePrompt) {
        const { res, body, b64 } = await generateNewsletterImage(apiKey, imagePrompt);
        if (!res.ok || !b64) {
          const f = newsletterAiError(body, res.status);
          imageError = `Afbeelding niet gemaakt: ${f.message}`;
          if (f.providerDenied) await context.supabase.from('settings').update({ newsletter_ai_denial: { message: f.message, status: 403, at: new Date().toISOString() } }).eq('id', 1);
        } else {
          const name = `${crypto.randomUUID()}.png`;
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const { error: upErr } = await context.supabase.storage.from('newsletter-images').upload(name, bytes, { contentType: 'image/png' });
          if (upErr) imageError = 'Afbeelding kon niet bewaard worden.';
          else image_url = `https://werkbonnenriory.lovable.app/api/public/nieuwsbrief-afbeelding/${name}`;
        }
      }
      const draft = { ...text, image_url };
      return { draft, error: imageError, status: 200 };
    } catch {
      return { draft: null, error: failure?.message ?? 'AI heeft geen bruikbaar nieuwsbriefconcept opgeleverd. Jouw tekst is behouden.', status: failure?.status ?? 422 };
    }
  });