import { tokenHash } from './document-tracking';
import { reviewFeedInput, reviewFeedPage, type ReviewFeedInput, type ReviewInvoice } from './review-feed';

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
    if (Number(request.headers.get('Content-Length') ?? 0) > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: 'Aanvraag te groot.' }, 413);
    input = reviewFeedInput.parse(JSON.parse(raw));
  } catch { return reply({ error: 'Ongeldige aanvraag.' }, 400); }
  try { return reply(reviewFeedPage(await load(input), input.limit)); }
  catch { return reply({ error: 'Verzonden facturen ophalen mislukt.' }, 500); }
}