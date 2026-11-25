import { tokenHash } from './document-tracking';
import { reviewFeedInput, reviewFeedPage, type ReviewFeedInput, type ReviewInvoice } from './review-feed';

function parseFeedQuery(url: URL): unknown {
  const allowed = new Set(['limit', 'sent_at', 'id']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw new Error('unknown param');
  }
  const limitRaw = url.searchParams.get('limit');
  const sentAt = url.searchParams.get('sent_at');
  const id = url.searchParams.get('id');
  const out: Record<string, unknown> = {};
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw)) throw new Error('invalid limit');
    out['limit'] = Number(limitRaw);
  }
  if (sentAt !== null || id !== null) {
    out['cursor'] = { sent_at: sentAt ?? '', id: id ?? '' };
  }
  return out;
}

/** A dedicated shared token is required before any private invoice data is read. */
export async function handleReviewFeed(request: Request, secret: string | undefined,
  load: (input: ReviewFeedInput) => Promise<ReviewInvoice[]>) {
  const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!secret) return reply({ error: 'Reviewkoppeling nog niet ingesteld.' }, 503);
  const supplied = request.headers.get('Authorization')?.match(/^Bearer (\S{1,512})$/)?.[1];
  if (!supplied || await tokenHash(supplied) !== await tokenHash(secret)) return reply({ error: 'Geen toegang.' }, 401);
  let input: ReviewFeedInput;
  try {
    if (request.method === 'GET') {
      input = reviewFeedInput.parse(parseFeedQuery(new URL(request.url)));
    } else {
      if (Number(request.headers.get('Content-Length') ?? 0) > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
      input = reviewFeedInput.parse(JSON.parse(raw));
    }
  } catch { return reply({ error: 'Ongeldige aanvraag.' }, 400); }
  try { return reply(reviewFeedPage(await load(input), input.limit)); }
  catch { return reply({ error: 'Verzonden facturen ophalen mislukt.' }, 500); }
}