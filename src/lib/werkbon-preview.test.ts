import { expect, it } from 'vitest';
import { werkbonMailData } from './werkbon-mail';
import { visibleWerkbonPreview } from './werkbon-preview';

const data = werkbonMailData({ number: 42, customer_name: 'Jan', address: 'Kerkstraat 12', description: 'Reinigen', signed_at: null, signed_name: null, distance_km: 10, warranty: false, vat_number: 'BE0123', paid_at: '2026-10-29', paid_amount: 150, paid_method: 'cash' }, null, 3600, []);

it('verbergt klantvelden voor een ploeg zonder klantzichtbaarheid', () => {
  expect(visibleWerkbonPreview(data, { showContact: false, showPrices: true })).toMatchObject({ customer: 'Klant', address: null, siteAddress: null, vatNumber: null, description: 'Reinigen' });
});
it('verbergt het betaalde bedrag voor een ploeg zonder prijszichtbaarheid', () => {
  expect(visibleWerkbonPreview(data, { showContact: true, showPrices: false }).paid).toBeNull();
});
it('behoudt het betaalde bedrag en klantgegevens voor de beheerder', () => {
  expect(visibleWerkbonPreview(data, { showContact: true, showPrices: true })).toEqual(data);
});