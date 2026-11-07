export const PURCHASE_MAILBOX_ADDRESS = 'boekhouding@riory.be';

export async function peppolBeforeMail<T>(receive: () => Promise<{ errors: string[] }>, readMail: () => Promise<T>): Promise<T> {
  const result = await receive();
  if (result.errors.length) throw new Error(`Peppol eerst controleren: ${result.errors.join('; ')}`);
  return readMail();
}

export function purchaseAttachment(a: { contentType?: string; name?: string; isInline?: boolean }) {
  if (a.isInline) return false;
  return a.contentType === 'application/pdf' || /\.(pdf|jpe?g|png|webp)$/i.test(a.name ?? '') || ['image/jpeg', 'image/png', 'image/webp'].includes(a.contentType ?? '');
}