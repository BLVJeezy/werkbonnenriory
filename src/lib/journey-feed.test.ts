import { describe, expect, it } from 'vitest';
import { buildJourneyRows, normEmail, normPhone, sha256, type JourneyWorkOrder } from './journey-feed';
import { handleJourneyFeed } from './journey-feed.server';

const wo = (p: Partial<JourneyWorkOrder> = {}): JourneyWorkOrder => ({
  id: 'w1', created_at: '2026-11-01T08:00:00Z', received_at: null, status: 'nieuw', email: 'Klant@Example.com ',
  billing_email: null, phone: '+32 470 12 34 56', urgent: false, first_customer: false, warranty: false, no_invoice: false,
  not_needed: false, contract_id: null, syndicus: null, technician_id: null, scheduled_date: null, quote_pending: false,
  quote_approved: false, signed_at: null, paid_at: null, paid_amount: null, source_message_id: 'm1', ...p,
});

describe('journey feed', () => {
  it('normaliseert e-mail en telefoon identiek voor site en app', () => {
    expect(normEmail(' Klant@Example.com ')).toBe('klant@example.com');
    expect(normPhone('+32 470 12 34 56')).toBe(normPhone('0470/12.34.56'));
    expect(normEmail('geen-mail')).toBeNull();
  });

  it('deelt enkel hashes, geen contactgegevens', async () => {
    const r = (await buildJourneyRows([wo()], [], [], []))[0]!;
    expect(r.h.e).toEqual([await sha256('email:klant@example.com')]);
    expect(JSON.stringify(r)).not.toContain('example.com');
    expect(JSON.stringify(r)).not.toContain('470');
  });

  it('volgt offerte, werkbon, factuur en herinnering', async () => {
    const r = (await buildJourneyRows(
      [wo({ status: 'afgetekend', signed_at: '2026-11-03T10:00:00Z', technician_id: 't', scheduled_date: '2026-11-03' })],
      [{ id: 'q', kind: 'offerte', status: 'akkoord', sent_at: 'x', signed_at: 'y', reminder_stage: 1, work_order_id: null, source_work_order_id: 'w1', created_at: '2026-11-01' }],
      [{ id: 'i', kind: 'factuur', status: 'verzonden', sent_at: '2026-11-04', sent_via: 'peppol', peppol_sent_at: 'z', post_sent_at: null, due_date: '2026-11-05', paid_at: null, paid_amount: 0, total: 200, work_order_id: 'w1', extra_work_order_ids: [], credit_for: null }],
      [{ invoice_id: 'i', stage: 2, status: 'accepted' }, { invoice_id: 'i', stage: 3, status: 'uncertain' }],
      '2026-11-10',
    ))[0]!;
    expect(r.ingepland).toBe(true);
    expect(r.afgesloten).toBe('afgetekend');
    expect(r.offerte).toMatchObject({ verzonden: true, getekend: true, herinnering: 1 });
    expect(r.factuur).toMatchObject({ verzonden: true, via: 'peppol', betaald: false, vervallen: true, herinnering: 2 });
  });

  it('afrekenen ter plaatse en betaalde factuur', async () => {
    const r = (await buildJourneyRows(
      [wo({ paid_at: '2026-11-02', paid_amount: 165 })], [],
      [{ id: 'i', kind: 'factuur', status: 'betaald', sent_at: 'a', sent_via: 'email', peppol_sent_at: null, post_sent_at: null, due_date: '2026-11-01', paid_at: 'b', paid_amount: 165, total: 165, work_order_id: null, extra_work_order_ids: ['w1'], credit_for: null }],
      [],
    ))[0]!;
    expect(r.afgesloten).toBe('afgerekend');
    expect(r.factuur).toMatchObject({ betaald: true, vervallen: false, via: 'mail' });
  });

  it('weigert zonder of met foute sleutel', async () => {
    const load = async () => { throw new Error('mag niet geladen worden'); };
    const req = (auth?: string) => new Request('https://x/api/public/journey', { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: '{"from":"2026-10-01T00:00:00Z"}' });
    expect((await handleJourneyFeed(req(), 'geheim', load)).status).toBe(401);
    expect((await handleJourneyFeed(req('Bearer fout'), 'geheim', load)).status).toBe(401);
    expect((await handleJourneyFeed(req('Bearer geheim'), undefined, load)).status).toBe(503);
  });

  it('geeft rijen terug met juiste sleutel', async () => {
    const res = await handleJourneyFeed(
      new Request('https://x', { method: 'POST', headers: { Authorization: 'Bearer geheim' }, body: '{"from":"2026-10-01T00:00:00Z"}' }),
      'geheim', async () => ({ orders: [wo()], quotes: [], invoices: [], reminders: [], truncated: false, quotes_without_task: 0 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows).toHaveLength(1);
  });
});
