import { z } from 'zod';

export const consentSchema = z.object({ customerId: z.string().uuid(), status: z.enum(['subscribed', 'unsubscribed']), evidence: z.string().trim().min(3, 'Vermeld de bron en datum van de toestemming.').max(2000) });
export const campaignSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(160), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(30000) });
export const normalizeNewsletterEmail = (email: string | null) => (email ?? '').trim().toLowerCase();
export function eligibleNewsletterRecipient(customer: { email: string | null }, consent?: { email: string; status: string } | null) {
  const email = normalizeNewsletterEmail(customer.email);
  return z.string().email().safeParse(email).success && consent?.status === 'subscribed' && normalizeNewsletterEmail(consent.email) === email;
}
export async function newsletterTokenHash(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}