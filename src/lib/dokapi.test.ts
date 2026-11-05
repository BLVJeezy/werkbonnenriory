import { describe, expect, it } from 'vitest';
import { incomingUlidFromWebhook, outgoingPayload, verifyDokapiSignature } from './dokapi';
import { PEPPOL_INVOICE_DOCUMENT, PEPPOL_INVOICE_PROCESS } from './peppol-test-invoice';

async function hmacHex(body: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('verifyDokapiSignature', () => {
  it('accepts the correct HMAC-SHA256 hex signature of the raw body', async () => {
    const sig = await hmacHex('{"documentUlid":"01ABC"}', 'geheim');
    await expect(verifyDokapiSignature('{"documentUlid":"01ABC"}', sig, 'geheim')).resolves.toBe(true);
  });
  it('rejects a signature over a changed body or another secret', async () => {
    const sig = await hmacHex('{"documentUlid":"01ABC"}', 'geheim');
    await expect(verifyDokapiSignature('{"documentUlid":"02DEF"}', sig, 'geheim')).resolves.toBe(false);
    await expect(verifyDokapiSignature('{"documentUlid":"01ABC"}', sig, 'ander-geheim')).resolves.toBe(false);
  });
  it('rejects missing or malformed signatures without throwing', async () => {
    await expect(verifyDokapiSignature('{}', null, 'geheim')).resolves.toBe(false);
    await expect(verifyDokapiSignature('{}', 'kort', 'geheim')).resolves.toBe(false);
  });
});

describe('incomingUlidFromWebhook', () => {
  it('finds the document id in the known payload shapes', () => {
    expect(incomingUlidFromWebhook({ documentUlid: '01A' })).toBe('01A');
    expect(incomingUlidFromWebhook({ ulid: '01B' })).toBe('01B');
    expect(incomingUlidFromWebhook({ document: { ulid: '01C' } })).toBe('01C');
    expect(incomingUlidFromWebhook({ data: { documentUlid: '01D' } })).toBe('01D');
  });
  it('returns null when there is no document id', () => {
    expect(incomingUlidFromWebhook({ event: 'ping' })).toBeNull();
    expect(incomingUlidFromWebhook(null)).toBeNull();
  });
});

describe('outgoingPayload', () => {
  it('builds the exact metadata Dokapi expects for a Peppol invoice', () => {
    expect(outgoingPayload('0208:0840931404', '0208:0123456789', 'factuur-2026001')).toEqual({
      sender: { value: '0208:0840931404' },
      receiver: { value: '0208:0123456789' },
      c1CountryCode: 'BE',
      documentTypeIdentifier: { value: PEPPOL_INVOICE_DOCUMENT },
      processIdentifier: { value: PEPPOL_INVOICE_PROCESS },
      externalReference: 'factuur-2026001',
    });
  });
});
