import { describe, expect, it } from 'vitest';
import { bankSplitSummary } from './bank-split';
describe('betaling verdelen', () => {
  it('verdeelt Lovable 75,91 over Lovable 75 en BNP 0,91', () => {
    expect(bankSplitSummary(-75.91, [75, 0.91])).toEqual({ sum: 75.91, difference: 0, valid: true });
  });
  it('blokkeert een verdeling die niet sluit', () => {
    expect(bankSplitSummary(-75.91, [75, 0.90])).toEqual({ sum: 75.90, difference: 0.01, valid: false });
  });
  it('weigert nulbedragen', () => {
    expect(bankSplitSummary(-75.91, [75.91, 0]).valid).toBe(false);
  });
});