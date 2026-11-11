import { describe, expect, it } from 'vitest';
import { attributionInvoiceInput, attributionInvoicePage, type AttributionInvoiceRow } from './attribution-invoices';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const row: AttributionInvoiceRow = {
  id: id(1), number: '20260900', kind: 'factuur', status: 'verzonden', issue_date: '2026-11-02', due_date: '2026-11-16',
  sent_at: '2026-11-02T10:00:00Z', paid_at: null, paid_amount: 0, net: 100, vat: 21, total: 121, vat_rate: 21,
  credit_for: null, created_at: '2026-11-02T09:00:00Z', updated_at: '2026-11-03T09:00:00Z', customer_id: id(5),
  customer: { name: 'Jan Peeters', email: 'jan@example.com', phone: '+32470000000', postalCode: '3740', city: 'Bilzen', vatNumber: null, street: 'Natveld' },
  lines: [{ description: 'Ontstopping', quantity: 1, unitPrice: 100, amount: 100, unit: 'u' }],
  work_orders: [{ id: id(7), activity: 'Ontstopping', signed_at: '2026-11-01T12:00:00Z', postal_code: '3740', first_customer: true }],
};

describe('attributie facturen API', () => {
  it('geeft klant met stabiel id, regels en werkbonnen in de afgesproken vorm', () => {
    const [inv] = attributionInvoicePage([row], 100).invoices;
    expect(inv.customer).toEqual({ id: id(5), name: 'Jan Peeters', email: 'jan@example.com', phone: '+32470000000', postal_code: '3740', city: 'Bilzen', vat_number: null });
    expect(inv.lines).toEqual([{ description: 'Ontstopping', quantity: 1, unit_price_excl_vat: 100, amount_excl_vat: 100 }]);
    expect(inv.work_orders).toEqual([{ id: id(7), activity: 'Ontstopping', signed_at: '2026-11-01T12:00:00Z', postal_code: '3740', first_customer: true }]);
    expect(inv.total).toBe(121);
  });
  it('laat creditnota-bedragen ongewijzigd', () => {
    const [inv] = attributionInvoicePage([{ ...row, kind: 'creditnota', credit_for: id(2), total: 50 }], 100).invoices;
    expect(inv.kind).toBe('creditnota');
    expect(inv.total).toBe(50);
    expect(inv.credit_for).toBe(id(2));
  });
  it('cursor volgt updated_at en id en meldt has_more', () => {
    const p = attributionInvoicePage([row, { ...row, id: id(2) }], 1);
    expect(p.next_cursor).toEqual({ updated_at: row.updated_at, id: row.id });
    expect(p.has_more).toBe(true);
    expect(p.invoices).toHaveLength(1);
  });
  it('weigert limit buiten 1..100 en onbekende velden', () => {
    expect(attributionInvoiceInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(attributionInvoiceInput.safeParse({ limit: 0 }).success).toBe(false);
    expect(attributionInvoiceInput.safeParse({ cursor: { completed_at: row.updated_at, id: row.id } }).success).toBe(false);
  });
});
