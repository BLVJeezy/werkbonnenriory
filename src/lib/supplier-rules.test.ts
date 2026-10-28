import { describe, expect, it } from 'vitest';
import { deductibleVat, supplierVatWarning } from './supplier-rules';
import { canExportPurchase } from './purchase-payment';
describe('Leveranciersregels', () => {
  it('past de ingestelde btw-aftrek toe', () => expect(deductibleVat(21,50)).toBe(10.5));
  it('controleert het ingestelde 6%-tarief zonder bedragen te herschrijven', () => { expect(supplierVatWarning(100,21,'6')).not.toBeNull(); expect(supplierVatWarning(100,6,'6')).toBeNull(); });
  it('verlegde btw verwacht geen leveranciers-btw', () => { expect(supplierVatWarning(100,21,'verlegd')).not.toBeNull(); expect(supplierVatWarning(100,0,'verlegd')).toBeNull(); });
  for (const method of ['domiciliering','kaart','cash']) it(`${method} wordt niet opnieuw via SEPA betaald`, () => expect(canExportPurchase({kind:'factuur',status:'goedgekeurd',total:121,payment_method:method})).toBe(false));
  it('overschrijving blijft betaalbaar', () => expect(canExportPurchase({kind:'factuur',status:'goedgekeurd',total:121,payment_method:'overschrijving'})).toBe(true));
});