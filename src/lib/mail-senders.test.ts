import { describe, expect, it } from 'vitest';
import { assertInvoiceMailbox, GENERAL_MAILBOX_ADDRESS, INVOICE_MAILBOX_ADDRESS } from './mail-senders';

describe('Riory-afzenders', () => {
  it('gebruikt boekhouding@riory.be voor facturen en creditnota’s', () => {
    expect(INVOICE_MAILBOX_ADDRESS).toBe('boekhouding@riory.be');
    expect(assertInvoiceMailbox({ mail: 'boekhouding@riory.be' })).toBe('boekhouding@riory.be');
  });
  it('behoudt info@riory.be voor andere communicatie', () => {
    expect(GENERAL_MAILBOX_ADDRESS).toBe('info@riory.be');
  });
  it('weigert verzending van facturen via de algemene mailbox', () => {
    expect(() => assertInvoiceMailbox({ mail: 'info@riory.be' })).toThrow('Meld aan met boekhouding@riory.be');
  });
  it('aanvaardt dezelfde mailbox ongeacht hoofdletters', () => {
    expect(assertInvoiceMailbox({ userPrincipalName: 'Boekhouding@Riory.be' })).toBe('boekhouding@riory.be');
  });
});