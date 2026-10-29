import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/reviews/invoices')({ server: { handlers: {
  POST: async ({ request }) => {
    const { handleReviewFeed } = await import('@/lib/review-feed.server');
    return handleReviewFeed(request, process.env['REVIEW_INVOICES_API_TOKEN'], async (input) => {
      // This privileged read is reached only after the dedicated shared token is verified.
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      let query = supabaseAdmin.from('invoices')
        .select('id,kind,status,sent_at,customer')
        .eq('kind', 'factuur').eq('status', 'verzonden').not('sent_at', 'is', null)
        .order('sent_at').order('id').limit(input.limit + 1);
      if (input.cursor) {
        const { sent_at, id } = input.cursor;
        query = query.or(`sent_at.gt.${sent_at},and(sent_at.eq.${sent_at},id.gt.${id})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    });
  },
} } });