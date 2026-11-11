import { describe, it, expect } from 'vitest';
import { canAccessInterventionMap, requireInterventionAdmin, normalizeInterventionAddress, groupInterventions, filterInterventions, emptyMapFilters, interventionDay, located, pickPremisesLocation, type Intervention } from './intervention-map';

const row = (patch: Partial<Intervention> = {}): Intervention => ({ id: 'one', number: 1, customer_name: 'VME', address: 'Kerkstraat 12, 9000 Gent', status: 'afgetekend', signed_at: '2026-11-02T23:30:00Z', paid_at: null, scheduled_date: '2026-11-01', created_at: '2026-11-01T12:00:00Z', technician_id: 'crew', activity_id: 'camera', technicians: { name: 'Ploeg' }, activities: { name: 'Camera' }, no_invoice: false, subcontract_auto: false, ...patch });
describe('Interventiekaart', () => {
  it('groepeert hetzelfde genormaliseerde volledige adres en telt unieke werkbonnen', () => {
    const groups = groupInterventions([row(), row({ id: 'two', address: ' KERKSTRAAT  12 9000 Gent ', scheduled_date: '2026-11-03' }), row()], []);
    expect(groups).toHaveLength(1); expect(groups[0]?.orders).toHaveLength(2); expect(groups[0]?.latest).toBe('2026-11-03');
  });
  it('houdt verschillende huisnummers en busnummers apart', () => {
    expect(groupInterventions([row(), row({ id: 'two', address: 'Kerkstraat 13, 9000 Gent' }), row({ id: 'three', address: 'Kerkstraat 12 bus 2, 9000 Gent' })], [])).toHaveLength(3);
  });
  it('normaliseert Nederlandse postcode-spaties en accenten', () => {
    expect(normalizeInterventionAddress('Éénstraat 3, 1234 AB Stad')).toBe(normalizeInterventionAddress('Eenstraat 3 1234AB Stad'));
  });
  it('gebruikt het werfadres en nooit facturatie als leeg werfadres aangevinkt is', () => {
    const groups = groupInterventions([row({ use_site_address: true, site_street: 'Werfstraat', site_house_number: '5', site_postal_code: '3500', site_city: 'Hasselt' }), row({ id: 'empty', use_site_address: true })], []);
    expect(groups.find(g => g.key === 'werfstraat 5 3500 hasselt')?.address).toBe('Werfstraat 5, 3500 Hasselt');
    expect(groups.find(g => g.key === 'missing:empty')?.cache).toBeNull();
  });
  it('neemt geen niet-uitgevoerde taken of offerteadressen op', () => {
    expect(groupInterventions([row({ status: 'nieuw' }), row({ status: 'offerte', id: 'q' })], [])).toHaveLength(0);
  });
  it('kiest de opdrachtdatum, anders Belgische afrondingsdatum', () => {
    expect(interventionDay(row())).toBe('2026-11-01'); expect(interventionDay(row({ scheduled_date: null }))).toBe('2026-11-03');
  });
  it('filtert datum, ploeg, soort, betaalstatus en adres/klant', () => {
    expect(filterInterventions([row()], { ...emptyMapFilters, from: '2026-11-01', until: '2026-11-01', crew: 'crew', activity: 'camera', status: 'unpaid', search: 'VME' })).toHaveLength(1);
    for (const patch of [{ from: '2026-11-02' }, { until: '2026-10-31' }, { crew: 'other' }, { activity: 'other' }, { status: 'paid' }, { search: 'geen' }]) expect(filterInterventions([row()], { ...emptyMapFilters, ...patch })).toHaveLength(0);
  });
  it.each(['marketing', 'technician', null, undefined, ''])('weigert kaarttoegang voor %s', role => expect(canAccessInterventionMap(role)).toBe(false));
  it('staat alleen admin toe en faalt gesloten', () => { expect(canAccessInterventionMap('admin')).toBe(true); expect(() => requireInterventionAdmin(true)).not.toThrow(); expect(() => requireInterventionAdmin(false)).toThrow(); expect(() => requireInterventionAdmin(null)).toThrow(); });
  it('tekent alleen geldige exact opgeslagen coördinaten', () => { expect(located(null)).toBe(false); expect(located({ address_key:'x', lat:51,lon:5,state:'located',source:'manual',error:null })).toBe(true); expect(located({ address_key:'x',lat:999,lon:5,state:'located',source:null,error:null })).toBe(false); });
  it('kiest uit een Google-antwoord enkel een exact adres, nooit een centroïde', () => {
    expect(pickPremisesLocation({ status: 'OK', results: [{ geometry: { location: { lat: 50.85, lng: 4.35 }, location_type: 'ROOFTOP' } }] })).toEqual({ lat: 50.85, lon: 4.35 });
    expect(pickPremisesLocation({ status: 'OK', results: [{ geometry: { location: { lat: 50.85, lng: 4.35 }, location_type: 'RANGE_INTERPOLATED' } }] })).toEqual({ lat: 50.85, lon: 4.35 });
    expect(pickPremisesLocation({ status: 'OK', results: [{ geometry: { location: { lat: 50.85, lng: 4.35 }, location_type: 'APPROXIMATE' } }] })).toBeNull();
    expect(pickPremisesLocation({ status: 'ZERO_RESULTS', results: [] })).toBeNull();
    expect(pickPremisesLocation(null)).toBeNull();
    expect(pickPremisesLocation({ results: [{ geometry: { location: { lat: 999, lng: 4 }, location_type: 'ROOFTOP' } }] })).toBeNull();
  });
});