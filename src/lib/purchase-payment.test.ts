import { describe, it, expect } from 'vitest';
import { canExportPurchase, matchPurchasePayment } from './purchase-payment';
const row = { id: 'one', invoice_number: 'INV-42', payment_ref: '+++123/4567/89012+++', total: 121, kind: 'factuur', status: 'goedgekeurd' };
const tx = { amount: -121, remittanceInformation: '+++123/4567/89012+++', executionDate: '2026-10-28', counterpartName: null };
describe('Aankoopbetalingen', () => {
  it('lettert een uitgaande betaling met bedrag en referentie af', () => { expect(matchPurchasePayment(tx, [row])?.id).toBe('one'); });
  it('weigert een ander bedrag', () => { expect(matchPurchasePayment({ ...tx, amount: -120 }, [row])).toBeNull(); });
  it('weigert matching op bedrag alleen', () => { expect(matchPurchasePayment({ ...tx, remittanceInformation: null }, [row])).toBeNull(); });
  it('weigert dubbele kandidaten', () => { expect(matchPurchasePayment(tx, [row, { ...row, id: 'two' }])).toBeNull(); });
  it('creditnota wordt alleen afgeletterd bij terugbetaling', () => {
    const credit = { ...row, kind: 'creditnota' };
    expect(matchPurchasePayment(tx, [credit])).toBeNull();
    expect(matchPurchasePayment({ ...tx, amount: 121 }, [credit])?.id).toBe('one');
  });
  it('betaalbestand kan nooit een creditnota betalen', () => { expect(canExportPurchase({ ...row, kind: 'creditnota' })).toBe(false); });
  it('klaargezette betalingen blijven afletterbaar', () => { expect(matchPurchasePayment(tx, [{ ...row, status: 'betaling_klaargezet' }])?.id).toBe('one'); });
  it('reeds betaald wordt niet nogmaals afgeletterd', () => { expect(matchPurchasePayment(tx, [{ ...row, status: 'betaald' }])).toBeNull(); });
  it('verwisselt INV-42 niet met INV-420', () => { expect(matchPurchasePayment({ ...tx, remittanceInformation: 'Factuur INV-420' }, [row])).toBeNull(); });
  it('negatieve factuur vereist expliciete creditnota-keuze', () => { expect(matchPurchasePayment(tx, [{ ...row, total: -121 }])).toBeNull(); });
});