import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/attribution/invoices')({ server: { handlers: {
  POST: async ({ request }) => {
    const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' };
    const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
    const secret = process.env['ATTRIBUTION_API_TOKEN'];
    if (!secret) return reply({ error: 'Attributiekoppeling nog niet ingesteld.' }, 503);
    const { tokenHash } = await import('@/lib/document-tracking');
    const supplied = request.headers.get('Authorization')?.match(/^Bearer (\S{1,512})$/)?.[1];
    if (!supplied || await tokenHash(supplied) !== await tokenHash(secret)) return reply({ error: 'Geen toegang.' }, 401);
    const { attributionInvoiceInput, attributionInvoicePage } = await import('@/lib/attribution-invoices');
    let input;
    try {
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
      input = attributionInvoiceInput.parse(JSON.parse(raw));
    } catch { return reply({ error: 'Ongeldige aanvraag.' }, 400); }
    // Privileged read only after the shared token is verified.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.rpc('attribution_invoices', {
      _after: input.cursor?.updated_at ?? null, _after_id: input.cursor?.id ?? null, _limit: input.limit + 1,
    } as never);
    if (error) return reply({ error: 'Facturen ophalen mislukt.' }, 500);
    return reply(attributionInvoicePage((data ?? []) as never, input.limit));
  },
} } });
