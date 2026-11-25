import { tokenHash } from './document-tracking';
import { reviewWorkOrderInput, reviewWorkOrderPage, type ReviewWorkOrderInput, type ReviewWorkOrderRow } from './review-workorders';

function parseWorkOrderQuery(url: URL): unknown {
  const allowed = new Set(['limit', 'completed_at', 'id']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw new Error('unknown param');
  }
  const limitRaw = url.searchParams.get('limit');
  const completedAt = url.searchParams.get('completed_at');
  const id = url.searchParams.get('id');
  const out: Record<string, unknown> = {};
  if (limitRaw !== null) {
    if (!/^\d+$/.test(limitRaw)) throw new Error('invalid limit');
    out['limit'] = Number(limitRaw);
  }
  if (completedAt !== null || id !== null) {
    out['cursor'] = { completed_at: completedAt ?? '', id: id ?? '' };
  }
  return out;
}

/** A dedicated shared token is required before any completed work-order data is read. */
export async function handleReviewWorkOrders(
  request: Request,
  secret: string | undefined,
  load: (input: ReviewWorkOrderInput) => Promise<ReviewWorkOrderRow[]>,
) {
  const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!secret) return reply({ error: 'Reviewkoppeling nog niet ingesteld.' }, 503);
  const supplied = request.headers.get('Authorization')?.match(/^Bearer (\S{1,512})$/)?.[1];
  if (!supplied || await tokenHash(supplied) !== await tokenHash(secret)) return reply({ error: 'Geen toegang.' }, 401);
  let input: ReviewWorkOrderInput;
  try {
    if (request.method === 'GET') {
      input = reviewWorkOrderInput.parse(parseWorkOrderQuery(new URL(request.url)));
    } else {
      if (Number(request.headers.get('Content-Length') ?? 0) > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
      input = reviewWorkOrderInput.parse(JSON.parse(raw));
    }
  } catch { return reply({ error: 'Ongeldige aanvraag.' }, 400); }
  try { return reply(reviewWorkOrderPage(await load(input), input.limit)); }
  catch { return reply({ error: 'Afgewerkte werkbonnen ophalen mislukt.' }, 500); }
}