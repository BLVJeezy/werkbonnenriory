import { expect, it } from 'vitest';
import { removePaymentPatch } from './work-order-payment';
it('verwijdert bedrag, betaalwijze en betaaldatum', () => {
  expect(removePaymentPatch()).toEqual({ paid_method: null, paid_amount: null, paid_at: null });
});
it('behoudt afgeronde status en handtekening', () => {
  const row = {status:'afgetekend', signature:'handtekening', signed_at:'2026-10-28',paid_amount:203.57};
  expect({...row,...removePaymentPatch()}).toEqual({status:'afgetekend',signature:'handtekening',signed_at:'2026-10-28',paid_amount:null,paid_method:null,paid_at:null});
});