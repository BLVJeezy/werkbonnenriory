import { describe, expect, it } from 'vitest';
import { consentSchema, eligibleNewsletterRecipient, newsletterTokenHash } from './newsletters';
describe('Nieuwsbrieftoestemming', () => {
  it('meldt elke klant met geldig mailadres standaard aan', () => expect(eligibleNewsletterRecipient({ email: 'klant@example.be' })).toBe(true));
  it('sluit klanten zonder geldig mailadres uit', () => expect(eligibleNewsletterRecipient({ email: null })).toBe(false));
  it('sluit uitgeschreven klanten uit', () => expect(eligibleNewsletterRecipient({ email: 'klant@example.be' }, { email: 'Klant@example.be', status: 'unsubscribed' })).toBe(false));
  it('vereist een vastgelegde bron', () => expect(consentSchema.safeParse({ customerId: '12345678-1234-4234-8234-123456789012', status: 'subscribed', evidence: '' }).success).toBe(false));
  it('slaat alleen een hash van de persoonlijke link op', async () => { const hash = await newsletterTokenHash('persoonlijke-link'); expect(hash).toHaveLength(64); expect(hash).not.toBe('persoonlijke-link'); });
});