export const PURCHASE_MAILBOX_ADDRESS = 'boekhouding@riory.be';
// Fixed activation date, not a rolling "today": delayed imports remain eligible.
export const PURCHASE_MAIL_START = '2026-11-06T23:00:00Z';

export function eligiblePurchaseMail(receivedDateTime?: string) {
  if (!receivedDateTime) return false;
  const received = Date.parse(receivedDateTime);
  return Number.isFinite(received) && received >= Date.parse(PURCHASE_MAIL_START);
}

export async function peppolBeforeMail<T>(receive: () => Promise<{ errors: string[] }>, readMail: () => Promise<T>): Promise<T> {
  const result = await receive();
  if (result.errors.length) throw new Error(`Peppol eerst controleren: ${result.errors.join('; ')}`);
  return readMail();
}

export function purchaseAttachment(a: { contentType?: string; name?: string; isInline?: boolean }) {
  if (a.isInline) return false;
  return a.contentType === 'application/pdf' || /\.(pdf|jpe?g|png|webp)$/i.test(a.name ?? '') || ['image/jpeg', 'image/png', 'image/webp'].includes(a.contentType ?? '');
}