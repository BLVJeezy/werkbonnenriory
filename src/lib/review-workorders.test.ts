import { describe, expect, it, vi } from 'vitest';
import { reviewWorkOrderPage } from './review-workorders';
import { handleReviewWorkOrders } from './review-workorders.server';

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
  it('verwerkt POST en GET met strikte Bearer-auth en cursorvalidatie', async () => {
    const load = vi.fn().mockResolvedValue([row]);
    const postReq = new Request('https://werkbonnen.riory.be/api/public/reviews/werkbonnen', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-only-token', Accept: 'application/json' },
      body: '{"limit":10}',
    });
    expect((await handleReviewWorkOrders(postReq.clone(), undefined, load)).status).toBe(503);
    expect((await handleReviewWorkOrders(postReq.clone(), 'wrong', load)).status).toBe(401);
    expect(load).not.toHaveBeenCalled();

    const postOk = await handleReviewWorkOrders(postReq, 'test-only-token', load);
    expect(postOk.status).toBe(200);
    expect(postOk.headers.get('cache-control')).toBe('private, no-store');
    expect((await postOk.json()).work_orders).toEqual([row]);

    const getReq = new Request('https://werkbonnen.riory.be/api/public/reviews/werkbonnen?limit=3', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-only-token', Accept: 'application/json' },
    });
    const getOk = await handleReviewWorkOrders(getReq, 'test-only-token', load);
    expect(getOk.status).toBe(200);
    expect(load).toHaveBeenLastCalledWith({ limit: 3 });

    const badGet = new Request('https://werkbonnen.riory.be/api/public/reviews/werkbonnen?limit=3&token=nope', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-only-token', Accept: 'application/json' },
    });
    expect((await handleReviewWorkOrders(badGet, 'test-only-token', load)).status).toBe(400);
  });
});
