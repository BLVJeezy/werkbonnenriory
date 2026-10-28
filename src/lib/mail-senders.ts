export const INVOICE_MAILBOX_KEY = 'microsoft_outlook_invoice';
export const INVOICE_MAILBOX_ADDRESS = 'boekhouding@riory.be';
export const GENERAL_MAILBOX_ADDRESS = 'info@riory.be';

export function assertInvoiceMailbox(profile: { mail?: string | null; userPrincipalName?: string | null }) {
  const address = (profile.mail || profile.userPrincipalName || '').trim().toLowerCase();
  if (address !== INVOICE_MAILBOX_ADDRESS) throw new Error(`Meld aan met ${INVOICE_MAILBOX_ADDRESS}; de gekozen mailbox is niet de factuurafzender.`);
  return address;
}