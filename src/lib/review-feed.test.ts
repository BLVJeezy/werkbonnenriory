import { describe, expect, it, vi } from 'vitest';
import { reviewFeedPage, reviewRecipient, type ReviewInvoice } from './review-feed';
import { handleReviewFeed } from './review-feed.server';

const invoice: ReviewInvoice = { id: '00000000-0000-4000-8000-000000000001', kind: 'factuur', status: 'verzonden', sent_at: '2026-10-29T12:00:00Z', customer: { email: 'klant@example.com', name: 'Privé', total: 100 } };
const request = (body = '{}', token = 'test-only-token') => new Request('https://example.com/api/public/reviews/invoices', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });

describe('reviewfacturen API', () => {
  it('geeft enkel email en stabiele verzendidentiteit, geen klantnaam of prijzen', () => {
    expect(reviewRecipient(invoice)).toEqual({ id: invoice.id, email: 'klant@example.com', sent_at: invoice.sent_at });
  });
  it.each(['concept', 'fout'])('geeft geen klantadres voor status %s', (status) => {
    expect(reviewRecipient({ ...invoice, status })).toBeNull();
  });
  it('geeft geen adres zonder geregistreerde verzending', () => {
    expect(reviewRecipient({ ...invoice, sent_at: null })).toBeNull();
  });
  it('sluit creditnotas uit', () => {
    expect(reviewRecipient({ ...invoice, kind: 'creditnota' })).toBeNull();
  });
  it('slaat ongeldige mailadressen over maar bewaart de voortgang', () => {
    expect(reviewFeedPage([{ ...invoice, customer: { email: '' } }], 100)).toEqual({ version: 1, invoices: [], next_cursor: { id: invoice.id, sent_at: invoice.sent_at }, has_more: false });
  });
  it('gebruikt verzendtijd en ID samen voor paging en behoudt ID bij herhalen', () => {
    const page = reviewFeedPage([invoice, { ...invoice, id: '00000000-0000-4000-8000-000000000002' }], 1);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toEqual({ sent_at: invoice.sent_at, id: invoice.id });
    expect(page.invoices[0]?.id).toBe(reviewFeedPage([invoice], 1).invoices[0]?.id);
  });
  it('leest nooit gegevens bij ontbrekende of verkeerde sleutel', async () => {
    const load = vi.fn();
    expect((await handleReviewFeed(request(), undefined, load)).status).toBe(503);
    expect((await handleReviewFeed(request(), 'different-token', load)).status).toBe(401);
    expect(load).not.toHaveBeenCalled();
  });
  it('valideert paginering en cursor vóór lezen', async () => {
    const load = vi.fn();
    for (const body of ['{"limit":101}', '{"limit":0}', '{"cursor":{"id":"inject,filter","sent_at":"today"}}']) {
      expect((await handleReviewFeed(request(body), 'test-only-token', load)).status).toBe(400);
    }
    expect(load).not.toHaveBeenCalled();
  });
  it('geeft verzonden adressen terug na correcte authenticatie zonder caching', async () => {
    const load = vi.fn().mockResolvedValue([invoice]);
    const response = await handleReviewFeed(request(), 'test-only-token', load);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).invoices).toEqual([{ id: invoice.id, email: 'klant@example.com', sent_at: invoice.sent_at }]);
    expect(load).toHaveBeenCalledWith({ limit: 100 });
  });
});