import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/reviews/werkbonnen')({ server: { handlers: {
  POST: async ({ request }) => {
    const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' };
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
    const secret = process.env['REVIEW_INVOICES_API_TOKEN'];
    if (!secret) return reply({ error: 'Reviewkoppeling nog niet ingesteld.' }, 503);
    const { tokenHash } = await import('@/lib/document-tracking');
    const supplied = request.headers.get('Authorization')?.match(/^Bearer (\S{1,512})$/)?.[1];
    if (!supplied || await tokenHash(supplied) !== await tokenHash(secret)) return reply({ error: 'Geen toegang.' }, 401);
    const { reviewWorkOrderInput, reviewWorkOrderPage } = await import('@/lib/review-workorders');
    let input;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
      input = reviewWorkOrderInput.parse(JSON.parse(raw));
    } catch { return reply({ error: 'Ongeldige aanvraag.' }, 400); }
    // Privileged read only after the shared token is verified.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.rpc('review_completed_work_orders', {
      _after: input.cursor?.completed_at ?? null, _after_id: input.cursor?.id ?? null, _limit: input.limit + 1,
    } as never);
    if (error) return reply({ error: 'Afgewerkte werkbonnen ophalen mislukt.' }, 500);
    return reply(reviewWorkOrderPage((data ?? []) as never, input.limit));
  },
} } });
