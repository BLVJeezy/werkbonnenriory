import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/hooks/birthday-emails')({
  server: { handlers: { POST: async ({ request }) => {
    const authFailure = await authenticateCronRequest(request);
    if (authFailure) return authFailure;
    if (process.env['TIKKLOK_JOBS_ENABLED'] !== 'true') {
      return Response.json({ skipped: true, reason: 'Tikklok nog niet omgeschakeld' });
    }
    try {
      const { processBirthdayEmails } = await import('@/lib/tikklok/birthday-emails.server');
      const result = await processBirthdayEmails();
      return Response.json({ success: result.failed === 0, ...result });
    } catch {
      return Response.json({ error: 'Verjaardagsmails verwerken mislukt' }, { status: 500 });
    }
  } } },
});