import { describe, expect, it } from 'vitest';
import { isInvoiceReconciled } from './bank-reconciliation-status';
describe('afletterstatus', () => {
  it('betaald markeren alleen is niet afletteren', () => {
    expect(isInvoiceReconciled({ paid_amount: 100, bank_ref: 'werkbonnen:123' }, 100, false)).toBe(false);
  });
  it('volledig betaalde gekoppelde factuur is afgeletterd', () => {
    expect(isInvoiceReconciled({ paid_amount: 100 }, 100, true)).toBe(true);
  });
  it('deelbetaling is nog niet volledig afgeletterd', () => {
    expect(isInvoiceReconciled({ paid_amount: 40 }, 100, true)).toBe(false);
  });
  it('aankoop met betalingsledger is afgeletterd', () => {
    expect(isInvoiceReconciled({ paid_amount: 302.50, bank_reconciled: true }, 302.50, false)).toBe(true);
  });
});