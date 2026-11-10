import { createFileRoute } from '@tanstack/react-router';

const PAGE = 1000;

export const Route = createFileRoute('/api/public/journey')({ server: { handlers: {
  POST: async ({ request }) => {
    const { handleJourneyFeed } = await import('@/lib/journey-feed.server');
    return handleJourneyFeed(request, process.env['JOURNEY_API_TOKEN'], async ({ from, to }) => {
      // Privileged reads, reached only after the dedicated shared token is verified.
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { JOURNEY_MAX_ROWS } = await import('@/lib/journey-feed');

      const paged = async <T,>(build: (lo: number, hi: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
        const out: T[] = [];
        for (let lo = 0; lo < JOURNEY_MAX_ROWS; lo += PAGE) {
          const { data, error } = await build(lo, lo + PAGE - 1);
          if (error) throw error;
          out.push(...(data ?? []));
          if (!data || data.length < PAGE) break;
        }
        return out;
      };

      const orders = await paged((lo, hi) => {
        let q = supabaseAdmin.from('work_orders')
          .select('id,created_at,received_at,status,email,billing_email,phone,urgent,first_customer,warranty,no_invoice,not_needed,contract_id,syndicus,technician_id,scheduled_date,quote_pending,quote_approved,signed_at,paid_at,paid_amount,source_message_id')
          .gte('created_at', from).order('id').range(lo, hi);
        if (to) q = q.lte('created_at', to);
        return q;
      });
      // Quotes and invoices may be created up to a while after the task; read from the same start.
      const quotes = await paged((lo, hi) => supabaseAdmin.from('quotes')
        .select('id,kind,status,sent_at,signed_at,reminder_stage,work_order_id,source_work_order_id,created_at')
        .gte('created_at', from).order('id').range(lo, hi));
      const invoices = await paged((lo, hi) => supabaseAdmin.from('invoices')
        .select('id,kind,status,sent_at,sent_via,peppol_sent_at,post_sent_at,due_date,paid_at,paid_amount,total,work_order_id,extra_work_order_ids,credit_for')
        .gte('created_at', from).order('id').range(lo, hi));
      const reminders = await paged((lo, hi) => supabaseAdmin.from('invoice_reminders')
        .select('invoice_id,stage,status').gte('created_at', from).order('id').range(lo, hi));

      return {
        orders, quotes, invoices, reminders,
        truncated: orders.length >= JOURNEY_MAX_ROWS,
        quotes_without_task: quotes.filter((q: any) => !q.work_order_id && !q.source_work_order_id).length,
      };
    });
  },
} } });
