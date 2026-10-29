import { z } from 'zod';

export const reviewFeedInput = z.object({
  limit: z.number().int().min(1).max(100).default(100),
  cursor: z.object({ sent_at: z.string().datetime({ offset: true }), id: z.string().uuid() }).strict().optional(),
}).strict();

export type ReviewFeedInput = z.infer<typeof reviewFeedInput>;
export type ReviewInvoice = {
  id: string; kind: string; status: string; sent_at: string | null; customer: unknown;
};

export function reviewRecipient(invoice: ReviewInvoice) {
  if (invoice.kind !== 'factuur' || invoice.status !== 'verzonden' || !invoice.sent_at) return null;
  const customer = z.object({ email: z.string().trim().email() }).safeParse(invoice.customer);
  if (!customer.success) return null;
  return { id: invoice.id, email: customer.data.email, sent_at: invoice.sent_at };
}

export function reviewFeedPage(rows: ReviewInvoice[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    version: 1,
    invoices: page.flatMap((row) => { const recipient = reviewRecipient(row); return recipient ? [recipient] : []; }),
    next_cursor: last?.sent_at ? { sent_at: last.sent_at, id: last.id } : null,
    has_more: rows.length > limit,
  };
}