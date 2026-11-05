import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/aankoopfacturen/peppol')({
  server: { handlers: { POST: async ({ request }) => {
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
    if (!process.env['PEPPYRUS_API_KEY']) return Response.json({ skipped: 'Peppyrus niet gekoppeld' });
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { receivePeppolInvoices } = await import('@/lib/peppol-receive.server');
      const result = await receivePeppolInvoices(supabaseAdmin);
      return Response.json({ imported: result.imported, skipped: result.skipped, errors: result.errors.length }, { status: result.errors.length ? 500 : 200 });
    } catch {
      console.error('Automatische Peppol-ontvangst mislukt');
      return Response.json({ error: 'Peppol ophalen mislukt' }, { status: 500 });
    }
  } } },
});