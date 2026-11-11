import { z } from 'zod';

export const attributionInvoiceInput = z.object({
  limit: z.number().int().min(1).max(100).default(100),
  cursor: z.object({ updated_at: z.string().datetime({ offset: true }), id: z.string().uuid() }).strict().optional(),
}).strict();

export type AttributionInvoiceRow = {
  id: string; number: string | null; kind: string; status: string; issue_date: string | null; due_date: string | null;
  sent_at: string | null; paid_at: string | null; paid_amount: number | null; net: number | null; vat: number | null;
  total: number | null; vat_rate: number | null; credit_for: string | null; created_at: string; updated_at: string;
  customer_id: string | null; customer: Record<string, unknown> | null; lines: unknown; work_orders: unknown;
};

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const email = z.string().trim().email();

/** Amounts are passed as stored: credit notes keep their own (positive header) amounts; the consumer signs them. */
export function attributionInvoicePage(rows: AttributionInvoiceRow[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    version: 1,
    invoices: page.map((r) => {
      const c = r.customer ?? {};
      const mail = email.safeParse(c['email'] ?? '');
      return {
        id: r.id, number: r.number, kind: r.kind === 'creditnota' ? 'creditnota' : 'factuur', status: r.status,
        issue_date: r.issue_date, due_date: r.due_date, sent_at: r.sent_at, paid_at: r.paid_at,
        paid_amount: num(r.paid_amount), net: num(r.net), vat: num(r.vat), total: num(r.total), vat_rate: num(r.vat_rate),
        credit_for: r.credit_for, created_at: r.created_at, updated_at: r.updated_at,
        customer: {
          id: r.customer_id, name: text(c['name']), email: mail.success ? mail.data : null, phone: text(c['phone']),
          postal_code: text(c['postalCode'] ?? c['postal_code']), city: text(c['city']), vat_number: text(c['vatNumber'] ?? c['vat_number']),
        },
        lines: (Array.isArray(r.lines) ? r.lines : []).map((l: Record<string, unknown>) => ({
          description: text(l?.['description']), quantity: num(l?.['quantity']),
          unit_price_excl_vat: num(l?.['unitPrice'] ?? l?.['unit_price']), amount_excl_vat: num(l?.['amount']),
        })),
        work_orders: (Array.isArray(r.work_orders) ? r.work_orders : []).map((w: Record<string, unknown>) => ({
          id: String(w['id']), activity: text(w['activity']), signed_at: text(w['signed_at']),
          postal_code: text(w['postal_code']), first_customer: w['first_customer'] === true,
        })),
      };
    }),
    next_cursor: last ? { updated_at: last.updated_at, id: last.id } : null,
    has_more: rows.length > limit,
  };
}
