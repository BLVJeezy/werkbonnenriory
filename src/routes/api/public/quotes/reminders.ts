import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/quotes/reminders')({ server: { handlers: { POST: async ({ request }) => {
  const denied = await authenticateCronRequest(request); if (denied) return denied;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { processQuoteReminders } = await import('@/lib/quote-reminders.server');
  return Response.json(await processQuoteReminders(supabaseAdmin));
} } } });
