import { describe, expect, it } from 'vitest';
import { bankOfIban, bicFromIban } from './iban-bic';

describe('bankOfIban', () => {
  it('haalt de BIC van een Belgische bank uit het IBAN', () => {
    expect(bicFromIban('BE71 0961 2345 6769')).toBe('GKCCBEBB'); // 096 → Belfius
    expect(bicFromIban('be39 2100 1234 5678')).toBe('GEBABEBB'); // 210 → BNP Paribas Fortis
    expect(bankOfIban('BE41 4350 0754 7033')).toEqual({ bic: 'KREDBEBB', bank: 'KBC Bank' }); // 435 → KBC
  });

  it('haalt de BIC van een Nederlandse bank uit het IBAN', () => {
    expect(bicFromIban('NL12 ABNA 0123 4567 89')).toBe('ABNANL2A');
    expect(bicFromIban('NL18 INGB 0001 2345 67')).toBe('INGBNL2A');
  });

  it('laat het vak leeg bij een onbekende of buitenlandse bank', () => {
    expect(bicFromIban('BE68 5390 0754 7034')).toBeNull(); // 539 is niet toegewezen
    expect(bicFromIban('DE12 5001 0517 5407 3249 03')).toBeNull();
    expect(bicFromIban('')).toBeNull();
    expect(bicFromIban(null)).toBeNull();
    expect(bicFromIban('BE')).toBeNull();
  });
});
