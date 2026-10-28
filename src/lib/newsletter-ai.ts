import { z } from 'zod';

export const newsletterAiInput = z.object({ text: z.string().trim().min(1, 'Vul eerst jouw tekst in.').max(12000, 'Gebruik maximaal 12.000 tekens.') });
export const newsletterAiOutput = z.object({ name: z.string(), subject: z.string(), body: z.string(), imagePrompt: z.string() }).strict();

export function newsletterAiError(body: unknown, status: number) {
  const value = body as { message?: unknown; error?: { message?: unknown; type?: string }; type?: string } | null;
  const message = typeof value?.message === 'string' ? value.message : typeof value?.error?.message === 'string' ? value.error.message : `Nieuwsbrief genereren mislukt (${status}).`;
  const type = value?.type ?? value?.error?.type ?? '';
  const providerDenied = status === 403 && !['provider_not_available_in_region', 'model_requires_retention_consent', 'model_vendor_not_enabled', 'credit_limit_reached', 'ai_disabled'].includes(type) && !/credit|workspace|policy/i.test(type);
  return { message, status, providerDenied };
}