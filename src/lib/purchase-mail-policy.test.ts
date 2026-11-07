import { describe, expect, it, vi } from 'vitest';
import { peppolBeforeMail, purchaseAttachment, PURCHASE_MAILBOX_ADDRESS } from './purchase-mail-policy';

describe('aankoopmails', () => {
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