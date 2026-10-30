import { describe, expect, it } from 'vitest';
import { structuredReference } from './invoice-payment-reference';

describe('Belgische gestructureerde factuurmededeling', () => {
  it('genereert tien basiscijfers en de juiste modulo-97-controle', () => {
    expect(structuredReference('20260817')).toBe('+++002/0260/81739+++');
  });
  it('gebruikt 97 wanneer de rest nul is', () => {
    expect(structuredReference('97')).toBe('+++000/0000/09797+++');
  });
  it('behoudt dezelfde mededeling bij opmaaktekens in het nummer', () => {
    expect(structuredReference('2026-0817')).toBe('+++002/0260/81739+++');
  });
  it('houdt opeenvolgende facturen uniek', () => {
    expect(structuredReference('20260816')).toBe('+++002/0260/81638+++');
    expect(structuredReference('20260817')).not.toBe(structuredReference('20260816'));
  });
  it('weigert te lange of ontbrekende cijfers', () => {
    expect(() => structuredReference('12345678901')).toThrow();
    expect(() => structuredReference('')).toThrow();
  });
});