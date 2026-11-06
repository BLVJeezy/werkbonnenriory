import { describe, expect, it } from 'vitest';
import { bankSplitSummary } from './bank-split';
describe('betaling verdelen', () => {
  it('verdeelt Lovable 75,91 over Lovable 75 en BNP 0,91', () => {
    expect(bankSplitSummary(-75.91, [75, 0.91])).toEqual({ sum: 75.91, difference: 0, valid: true });
  });
  it('houdt het niet toegewezen deel open', () => {
    expect(bankSplitSummary(-75.91, [75, 0.90])).toEqual({ sum: 75.90, difference: 0.01, valid: true });
  });
  it('laat bij Lovable 91,09 en BNP 1,09 nog 90 openstaan', () => {
    expect(bankSplitSummary(-91.09, [1.09])).toEqual({ sum: 1.09, difference: 90, valid: true });
  });
  it('laat verdere aflettering van het restant toe', () => {
    expect(bankSplitSummary(-90, [75])).toEqual({ sum: 75, difference: 15, valid: true });
  });
  it('blokkeert bedragen boven het restant', () => {
    expect(bankSplitSummary(-90, [90.01]).valid).toBe(false);
  });
  it('weigert nulbedragen', () => {
    expect(bankSplitSummary(-75.91, [75.91, 0]).valid).toBe(false);
  });
});