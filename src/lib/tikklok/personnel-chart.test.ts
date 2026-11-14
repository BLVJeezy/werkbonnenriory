import { describe, expect, it } from 'vitest';
import { personnelChartMonths, personnelChartPoint } from './personnel-chart';

describe('maandelijkse tikklokgrafiek', () => {
  it('toont standaard alleen voorbije maanden', () => {
    expect(personnelChartMonths(2026, '2026-11-14', false)).toEqual(Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
    expect(personnelChartMonths(2027, '2026-11-14', false)).toEqual([]);
  });
  it('toont november alleen met de bestaande lopende-maandkeuze, nooit december', () => {
    expect(personnelChartMonths(2026, '2026-11-14', true)).toHaveLength(11);
    expect(personnelChartMonths(2026, '2026-11-14', true).at(-1)).toBe('2026-11');
  });
  it('telt klokuren op en gebruikt de gedeelde kostenraming zonder extra boeking', () => {
    const point = personnelChartPoint('2026-10', { rows: [{ workedHours: 160.25, warnings: [] }, { workedHours: 120.5, warnings: [] }], estimated: 6834.19 });
    expect(point.hours).toBe(280.75);
    expect(point.cost).toBe(6834.19);
  });
  it('houdt een onvolledige kostenraming onbekend, niet nul', () => {
    expect(personnelChartPoint('2026-10', { rows: [{ workedHours: 160, warnings: ['Loonprofiel ontbreekt'] }], estimated: null }).cost).toBeNull();
  });
});