import { describe, expect, it, vi } from 'vitest';
import { eligiblePurchaseMail, peppolBeforeMail, purchaseAttachment, PURCHASE_MAILBOX_ADDRESS, PURCHASE_MAIL_START } from './purchase-mail-policy';

describe('aankoopmails', () => {
  it('begint op 7 november om middernacht Belgische tijd', () => {
    expect(PURCHASE_MAIL_START).toBe('2026-11-06T23:00:00Z');
    expect(eligiblePurchaseMail('2026-11-06T22:59:59Z')).toBe(false);
    expect(eligiblePurchaseMail('2026-11-07T00:00:00+01:00')).toBe(true);
  });
  it('blijft latere mails toelaten zonder oude berichten mee te nemen', () => {
    expect(eligiblePurchaseMail('2026-11-08T09:00:00Z')).toBe(true);
    expect(eligiblePurchaseMail('2026-10-30T09:00:00Z')).toBe(false);
  });
  it('weigert ontbrekende of ongeldige ontvangstdatums', () => {
    expect(eligiblePurchaseMail()).toBe(false);
    expect(eligiblePurchaseMail('onbekend')).toBe(false);
  });
  it('gebruikt boekhouding@riory.be', () => expect(PURCHASE_MAILBOX_ADDRESS).toBe('boekhouding@riory.be'));
  it('verwerkt Peppol voor de mail', async () => {
    const order: string[] = [];
    await peppolBeforeMail(async () => { order.push('peppol'); return { errors: [] }; }, async () => { order.push('mail'); });
    expect(order).toEqual(['peppol', 'mail']);
  });
  it('importeert geen mails als Peppol niet gecontroleerd kon worden', async () => {
    const mail = vi.fn();
    await expect(peppolBeforeMail(async () => ({ errors: ['ontvangst mislukt'] }), mail)).rejects.toThrow('Peppol eerst');
    expect(mail).not.toHaveBeenCalled();
  });
  it('leest bonnetjes als foto maar niet als inline maillogo', () => {
    expect(purchaseAttachment({ name: 'bon.jpg', contentType: 'image/jpeg' })).toBe(true);
    expect(purchaseAttachment({ name: 'logo.png', isInline: true })).toBe(false);
  });
});