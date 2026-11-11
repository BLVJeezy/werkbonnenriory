import { z } from 'zod';

export const reviewWorkOrderInput = z.object({
  limit: z.number().int().min(1).max(100).default(100),
  cursor: z.object({ completed_at: z.string().datetime({ offset: true }), id: z.string().uuid() }).strict().optional(),
}).strict();

export type ReviewWorkOrderInput = z.infer<typeof reviewWorkOrderInput>;
export type ReviewWorkOrderRow = { id: string; completed_at: string | null; email: string | null; customer_name: string | null };

/** Only the id, completion time, a valid email and the customer name leave the app; no addresses or prices. */
export function reviewWorkOrderPage(rows: ReviewWorkOrderRow[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const email = z.string().trim().email();
  return {
    version: 1,
    work_orders: page.flatMap((r) => {
      const ok = r.completed_at ? email.safeParse(r.email ?? '') : null;
      const name = r.customer_name?.trim() || null;
      return ok?.success ? [{ id: r.id, email: ok.data, completed_at: r.completed_at!, customer_name: name }] : [];
    }),
    next_cursor: last?.completed_at ? { completed_at: last.completed_at, id: last.id } : null,
    has_more: rows.length > limit,
  };
}
