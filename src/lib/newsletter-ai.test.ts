import { describe, expect, it } from 'vitest';
import { newsletterAiInput, newsletterAiError } from './newsletter-ai';

describe('nieuwsbrief AI', () => {
  it('gebruikt de eigen tekst en weigert lege invoer', () => {
    expect(newsletterAiInput.parse({ text: '  Regenputten reinigen  ' }).text).toBe('Regenputten reinigen');
    expect(newsletterAiInput.safeParse({ text: '  ' }).success).toBe(false);
  });
  it('bewaart de foutmelding bij onvoldoende credits', () => {
    expect(newsletterAiError({ message: 'Onvoldoende credits; vul aan.' }, 402)).toEqual({ message: 'Onvoldoende credits; vul aan.', status: 402, providerDenied: false });
  });
  it('herkent blijvende providerweigering', () => {
    expect(newsletterAiError({ error: { message: 'Toegang geweigerd', type: 'permission_error' } }, 403).providerDenied).toBe(true);
    expect(newsletterAiError({ type: 'model_vendor_not_enabled' }, 403).providerDenied).toBe(false);
  });
});