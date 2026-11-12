import { expect, it } from 'vitest';
import { removePaymentPatch } from './work-order-payment';
it('verwijdert bedrag, betaalwijze en betaaldatum', () => {
  expect(removePaymentPatch()).toEqual({ paid_method: null, paid_amount: null, paid_at: null });
});
it('behoudt afgeronde status en handtekening', () => {
  const row = {status:'afgetekend', signature:'handtekening', signed_at:'2026-10-28',paid_amount:203.57};
  expect({...row,...removePaymentPatch()}).toEqual({status:'afgetekend',signature:'handtekening',signed_at:'2026-10-28',paid_amount:null,paid_method:null,paid_at:null});
});
import { invoicePaidAfterRemoval } from './work-order-payment';
describe('invoicePaidAfterRemoval', () => {
  it('haalt alleen de verwijderde werkbonbetaling van de factuur', () => { expect(invoicePaidAfterRemoval(749.26, 374.63)).toBe(374.63); });
  it('gaat nooit onder nul', () => { expect(invoicePaidAfterRemoval(100, 374.63)).toBe(0); });
});
