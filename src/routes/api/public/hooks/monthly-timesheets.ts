import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/hooks/monthly-timesheets')({
  server: { handlers: { POST: async ({ request }) => {
    const token = process.env['TIKKLOK_CRON_TOKEN'];
    if (!token || request.headers.get('Authorization') !== `Bearer ${token}`) {
      return Response.json({ error: 'Niet toegestaan' }, { status: 401 });
    }
    if (process.env['TIKKLOK_JOBS_ENABLED'] !== 'true') {
      return Response.json({ skipped: true, reason: 'Tikklok nog niet omgeschakeld' });
    }
    try {
      const { processMonthlyTimesheets } = await import('@/lib/tikklok/monthly-jobs.server');
      return await processMonthlyTimesheets();
    } catch {
      return Response.json({ error: 'Maandrapporten verwerken mislukt' }, { status: 500 });
    }
  } } },
});