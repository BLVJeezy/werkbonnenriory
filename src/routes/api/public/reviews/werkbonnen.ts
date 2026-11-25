import { createFileRoute } from '@tanstack/react-router';

const handle = async ({ request }: { request: Request }) => {
  const { handleReviewWorkOrders } = await import('@/lib/review-workorders.server');
  return handleReviewWorkOrders(request, process.env['REVIEW_INVOICES_API_TOKEN'], async (input) => {
    // Privileged read only after the shared token is verified.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin.rpc('review_completed_work_orders', {
      _after: input.cursor?.completed_at ?? null, _after_id: input.cursor?.id ?? null, _limit: input.limit + 1,
    } as never);
    if (error) throw error;
    return (data ?? []) as never;
  });
};

export const Route = createFileRoute('/api/public/reviews/werkbonnen')({
  server: { handlers: { GET: handle, POST: handle } },
});
