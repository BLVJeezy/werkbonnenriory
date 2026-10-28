import { describe, expect, it } from 'vitest';
import { consentSchema, eligibleNewsletterRecipient, newsletterTokenHash } from './newsletters';
describe('Nieuwsbrieftoestemming', () => {
  it('meldt bestaande klanten zonder toestemming niet aan', () => expect(eligibleNewsletterRecipient({ email: 'klant@example.be' })).toBe(false));
  it('laat alleen expliciet aangemelde klanten toe', () => expect(eligibleNewsletterRecipient({ email: 'klant@example.be' }, { email: 'klant@example.be', status: 'subscribed' })).toBe(true));
  it('sluit uitgeschreven klanten uit', () => expect(eligibleNewsletterRecipient({ email: 'klant@example.be' }, { email: 'klant@example.be', status: 'unsubscribed' })).toBe(false));
  it('draagt toestemming niet over naar een gewijzigd mailadres', () => expect(eligibleNewsletterRecipient({ email: 'nieuw@example.be' }, { email: 'oud@example.be', status: 'subscribed' })).toBe(false));
  it('vereist een vastgelegde bron', () => expect(consentSchema.safeParse({ customerId: '12345678-1234-4234-8234-123456789012', status: 'subscribed', evidence: '' }).success).toBe(false));
  it('slaat alleen een hash van de persoonlijke link op', async () => { const hash = await newsletterTokenHash('persoonlijke-link'); expect(hash).toHaveLength(64); expect(hash).not.toBe('persoonlijke-link'); });
});