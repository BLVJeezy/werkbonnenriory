// Dokapi (Peppol access point) REST client: OAuth2 client-credentials + JSON API.
// Replaces Peppyrus. Staging base URL until DOKAPI_LIVE=true switches to production.
import { PEPPOL_INVOICE_DOCUMENT, PEPPOL_INVOICE_PROCESS } from './peppol-test-invoice';

const TOKEN_URL = 'https://dev-portal.dokapi.io/api/oauth2/token';
const BASE_URL = () => process.env['DOKAPI_LIVE'] === 'true' ? 'https://peppol-api.dokapi.io/v1' : 'https://peppol-api.dokapi-stg.io/v1';

export function dokapiConfigured() {
  return !!(process.env['DOKAPI_CLIENT_ID'] && process.env['DOKAPI_CLIENT_SECRET']);
}
export const dokapiLive = () => process.env['DOKAPI_LIVE'] === 'true';

let cachedToken: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;
  const id = process.env['DOKAPI_CLIENT_ID'];
  const secret = process.env['DOKAPI_CLIENT_SECRET'];
  if (!id || !secret) throw new Error('Dokapi is voorbereid maar nog niet gekoppeld: client-id en secret ontbreken.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Dokapi-aanmelding mislukt (HTTP ${res.status}): ${(await res.text()).slice(0, 200) || 'leeg antwoord'}`);
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Dokapi gaf geen toegangstoken terug.');
  cachedToken = { token: data.access_token, exp: Date.now() + Math.max((data.expires_in ?? 300) - 60, 30) * 1000 };
  return data.access_token;
}

/** Single place that talks to Dokapi, so every call carries the same token, timeout and error text. */
export async function dokapiCall(path: string, init?: RequestInit) {
  const token = await accessToken();
  const res = await fetch(`${BASE_URL()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Dokapi ${path} mislukt (HTTP ${res.status}): ${(await res.text()).slice(0, 300) || 'leeg antwoord'}`);
  return res;
}

/** Metadata for one outgoing Peppol document (pure, so tests pin the exact shape Dokapi expects). */
export function outgoingPayload(senderId: string, receiverId: string, externalReference: string) {
  return {
    sender: { value: senderId },
    receiver: { value: receiverId },
    c1CountryCode: 'BE',
    documentTypeIdentifier: { value: PEPPOL_INVOICE_DOCUMENT },
    processIdentifier: { value: PEPPOL_INVOICE_PROCESS },
    externalReference,
  };
}

/** Sends one UBL invoice/credit note: create the document, then upload the XML to the pre-signed URL. */
export async function sendPeppolDocument(receiverId: string, xml: string, externalReference: string, senderId: string): Promise<string | null> {
  const created = await (await dokapiCall('/outgoing-peppol-documents', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outgoingPayload(senderId, receiverId, externalReference)),
  })).json() as { preSignedUploadUrl?: string; document?: { ulid?: string }; ulid?: string };
  if (!created.preSignedUploadUrl) throw new Error('Dokapi gaf geen upload-URL terug voor het document.');
  const up = await fetch(created.preSignedUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: xml, signal: AbortSignal.timeout(30000) });
  if (!up.ok) throw new Error(`Upload van het document naar Dokapi mislukt (HTTP ${up.status}).`);
  return created.document?.ulid ?? created.ulid ?? null;
}

/** Which Peppol address is registered on this Dokapi account? Never throws: setup problems are shown to the admin. */
export async function dokapiParticipant(): Promise<{ participantId: string | null; error: string | null }> {
  try {
    const page = await (await dokapiCall('/participant-registrations')).json() as any;
    const list: any[] = Array.isArray(page) ? page : (page.items ?? page.registrations ?? page.data ?? []);
    const ids = list.map(p => String(p?.participantIdentifier?.value ?? p?.participantId ?? p?.identifier ?? '')).filter(Boolean);
    const own = ids.find(id => id.includes('0840931404')) ?? ids[0] ?? null;
    return own ? { participantId: own, error: null } : { participantId: null, error: 'Dokapi kent geen Peppol-adres toe aan deze account.' };
  } catch (e) { return { participantId: null, error: e instanceof Error ? e.message : String(e) }; }
}

/** Downloads the original XML of one received document via a pre-signed URL. */
export async function downloadIncomingDocument(ulid: string): Promise<string> {
  const r = await (await dokapiCall(`/incoming-peppol-documents/${encodeURIComponent(ulid)}/generate-presigned-url`, { method: 'POST' })).text();
  let url = r.trim().replace(/^"|"$/g, '');
  try { const j = JSON.parse(r); url = j.url ?? j.preSignedUrl ?? j.preSignedDownloadUrl ?? url; } catch { /* plain text url */ }
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Document ${ulid} ophalen mislukt (HTTP ${res.status}).`);
  return res.text();
}

export async function confirmIncomingDocument(ulid: string) {
  await dokapiCall(`/incoming-peppol-documents/${encodeURIComponent(ulid)}/confirm`, { method: 'POST' });
}

/** HMAC-SHA256 hex of the raw body, compared timing-safe — same scheme as Dokapi's X-Dokapi-Signature. */
export async function verifyDokapiSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  const a = hex.toLowerCase(), b = signature.toLowerCase().replace(/^sha256=/, '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Finds the incoming document id in a webhook payload, whatever wrapper Dokapi uses. */
export function incomingUlidFromWebhook(payload: unknown): string | null {
  const p = payload as any;
  if (!p || typeof p !== 'object') return null;
  const cands = [p.documentUlid, p.ulid, p.documentId, p.document?.ulid, p.document?.id, p.data?.documentUlid, p.data?.ulid, p.data?.document?.ulid];
  for (const c of cands) if (typeof c === 'string' && c) return c;
  return null;
}
