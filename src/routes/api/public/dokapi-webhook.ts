// Public webhook Dokapi calls when a Peppol document arrives for our address.
// Verified with the HMAC secret stored by setupDokapiWebhook; unknown or bad signatures get no data.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/dokapi-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: s } = await supabaseAdmin.from('settings').select('peppol_webhook_secret').eq('id', 1).maybeSingle();
        if (!s?.peppol_webhook_secret) return Response.json({ error: 'Webhook is nog niet ingesteld' }, { status: 503 });
        const { verifyDokapiSignature, incomingUlidFromWebhook } = await import('@/lib/dokapi');
        const ok = await verifyDokapiSignature(raw, request.headers.get('x-dokapi-signature'), s.peppol_webhook_secret);
        if (!ok) return Response.json({ error: 'Ongeldige handtekening' }, { status: 401 });
        let payload: unknown = null;
        try { payload = JSON.parse(raw); } catch { return Response.json({ error: 'Ongeldige JSON' }, { status: 400 }); }
        const ulid = incomingUlidFromWebhook(payload);
        if (!ulid) return Response.json({ ok: true, ignored: true }, { status: 202 });
        try {
          const { processIncomingDokapiDocument } = await import('@/lib/dokapi-incoming.server');
          const result = await processIncomingDokapiDocument(supabaseAdmin, ulid);
          return Response.json({ ok: true, result });
        } catch (e) {
          // 500 so Dokapi retries; a permanent parse problem stays visible in the logs.
          console.error(`Dokapi webhook ${ulid} mislukt:`, e);
          return Response.json({ error: e instanceof Error ? e.message : 'Verwerking mislukt' }, { status: 500 });
        }
      },
    },
  },
});
