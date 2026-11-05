import { describe, expect, it } from 'vitest';
import { manualBankPreview } from './manual-bank-invoice';

describe('vrije bankkoppeling', () => {
  it('laat een deelbetaling op een niet voorgestelde factuur toe', () => {
    expect(manualBankPreview('verkoop', 100, 0, 40)).toMatchObject({ mode: 'payment', remaining: 60, error: null });
  });
  it('registreert teveel betaald geld afzonderlijk van het openstaande saldo', () => {
    expect(manualBankPreview('verkoop', 100, 0, 120)).toMatchObject({ mode: 'overpayment', overpaid: 20, remaining: 0 });
  });
  it('houdt de factuur betaald na terugstorting van het overschot', () => {
    expect(manualBankPreview('verkoop', 100, 120, -20)).toMatchObject({ mode: 'refund', error: null, overpaid: 0, remaining: 0 });
  });
  it('ondersteunt terugbetaling door een leverancier', () => {
    expect(manualBankPreview('aankoop', 100, 120, 20)).toMatchObject({ mode: 'refund', error: null, remaining: 0 });
  });
  it('weigert een terugstorting zonder geregistreerd overschot', () => {
    expect(manualBankPreview('verkoop', 100, 100, -20).error).toBeTruthy();
  });
  it('weigert meer terug te storten dan het overschot', () => {
    expect(manualBankPreview('verkoop', 100, 120, -21).error).toBeTruthy();
  });
});