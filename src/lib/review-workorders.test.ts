import { describe, expect, it } from 'vitest';
import { reviewWorkOrderPage } from './review-workorders';

const row = { id: '00000000-0000-4000-8000-000000000001', completed_at: '2026-11-02T12:00:00Z', email: 'klant@example.com', customer_name: 'Jan Peeters' };

describe('review werkbonnen API', () => {
  it('geeft enkel id, mail, afwerktijd en klantnaam', () => {
    expect(reviewWorkOrderPage([row], 100).work_orders).toEqual([row]);
  });
  it('geeft klantnaam null bij lege of ontbrekende naam, zonder de rij over te slaan', () => {
    expect(reviewWorkOrderPage([{ ...row, customer_name: '  ' }], 100).work_orders).toEqual([{ ...row, customer_name: null }]);
    expect(reviewWorkOrderPage([{ ...row, customer_name: null }], 100).work_orders).toEqual([{ ...row, customer_name: null }]);
  });
  it('slaat ongeldige mail over maar schuift cursor op', () => {
    const p = reviewWorkOrderPage([{ ...row, email: 'geen' }], 100);
    expect(p.work_orders).toEqual([]);
    expect(p.next_cursor).toEqual({ completed_at: row.completed_at, id: row.id });
  });
  it('meldt has_more bij extra rij', () => {
    expect(reviewWorkOrderPage([row, { ...row, id: '00000000-0000-4000-8000-000000000002' }], 1).has_more).toBe(true);
  });
});
