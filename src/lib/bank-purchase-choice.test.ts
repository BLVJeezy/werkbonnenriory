import { describe, expect, it } from 'vitest';
import { purchaseBankChoices } from './bank-purchase-choice';
describe('aankoopfacturen in bankkeuze', () => {
  const row = { id: 'p', kind: 'factuur', invoice_number: '2603032', supplier_name: 'Littera BV', total: 302.50, status: 'goedgekeurd' };
  it('maakt de aankoop uit de app selecteerbaar zonder boekhoudkopie', () => {
    expect(purchaseBankChoices([row], [])[0]).toMatchObject({ id: 'purchase:p', purchase_id: 'p', number: '2603032', direction: 'aankoop', paid_amount: 0 });
  });
  it('telt deelbetalingen en terugstortingen samen', () => {
    expect(purchaseBankChoices([row], [{ purchase_invoice_id: 'p', amount: -320 }, { purchase_invoice_id: 'p', amount: 17.50 }])[0]?.paid_amount).toBe(302.50);
  });
  it('behoudt handmatig betaald gemarkeerde aankopen', () => {
    expect(purchaseBankChoices([{ ...row, status: 'betaald' }], [])[0]?.paid_amount).toBe(302.50);
  });
  it('behoudt de oorspronkelijke betaling bij een extra betaling', () => {
    expect(purchaseBankChoices([{ ...row, bank_paid_base: 302.50 }], [{ purchase_invoice_id: 'p', amount: -20 }])[0]?.paid_amount).toBe(322.50);
  });
});