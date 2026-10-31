import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { insuranceAiInput, insuranceAiOutput, INSURANCE_AI_INSTRUCTIONS, type InsuranceAiDraft } from './insurance-quote-ai';
import { newsletterAiError } from './newsletter-ai';

/** Admin-only: AI proposes cause, findings and estimate posts from notes and private photos. Nothing is saved. */
export const suggestInsuranceQuote = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => insuranceAiInput.parse(d))
  .handler(async ({ data, context }): Promise<{ draft: InsuranceAiDraft | null; error: string | null }> => {
    const { data: admin } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!admin) throw new Error('Alleen voor beheerder');
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) return { draft: null, error: 'Lovable AI is nog niet ingesteld.' };
    const images: { type: 'image'; image: Uint8Array; mediaType: string }[] = [];
    for (const path of data.photoPaths) {
      const { data: file, error } = await context.supabase.storage.from('werkbon-fotos').download(path);
      if (error || !file) return { draft: null, error: 'Een foto kon niet geladen worden.' };
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mediaType = bytes[0] === 137 && bytes[1] === 80 ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : file.type || 'image/jpeg';
      images.push({ type: 'image', image: bytes, mediaType });
    }
    let failure: ReturnType<typeof newsletterAiError> | undefined;
    try {
      const { createResponsesCall } = await import('./ai/responses.server');
      const { result } = createResponsesCall(getRequest(), {
        baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey, model: 'openai/gpt-6-astra', outputSchema: insuranceAiOutput,
        onResponse: async (r) => { if (!r.ok) failure = newsletterAiError(await r.clone().json().catch(() => null), r.status); },
      }, [{ role: 'user', content: [{ type: 'text', text: `Notities van de beheerder:\n${data.notes || '(geen notities, baseer je op de foto’s)'}\n\nAantal foto's: ${images.length}` }, ...images] }], INSURANCE_AI_INSTRUCTIONS);
      const out = insuranceAiOutput.parse(await result.output);
      return { draft: out, error: null };
    } catch {
      return { draft: null, error: failure?.message ?? 'AI heeft geen bruikbaar voorstel opgeleverd. Jouw invoer is behouden.' };
    }
  });
