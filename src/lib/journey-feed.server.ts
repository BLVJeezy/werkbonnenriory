import { tokenHash } from './document-tracking';
import {
  buildJourneyRows, journeyInput, type JourneyInput, type JourneyInvoice, type JourneyQuote,
  type JourneyReminder, type JourneyWorkOrder,
} from './journey-feed';

type Loaded = {
  orders: JourneyWorkOrder[]; quotes: JourneyQuote[]; invoices: JourneyInvoice[]; reminders: JourneyReminder[];
  truncated: boolean; quotes_without_task: number;
};

/** A dedicated shared token is required before any work-order data is read. */
export async function handleJourneyFeed(request: Request, secret: string | undefined, load: (input: JourneyInput) => Promise<Loaded>) {
  const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization' };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!secret) return reply({ error: 'Journeykoppeling nog niet ingesteld.' }, 503);
  const supplied = request.headers.get('Authorization')?.match(/^Bearer (\S{1,512})$/)?.[1];
  if (!supplied || await tokenHash(supplied) !== await tokenHash(secret)) return reply({ error: 'Geen toegang.' }, 401);
  let input: JourneyInput;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: 'Aanvraag te groot.' }, 413);
    input = journeyInput.parse(JSON.parse(raw));
  } catch { return reply({ error: 'Ongeldige aanvraag.' }, 400); }
  try {
    const d = await load(input);
    const rows = await buildJourneyRows(d.orders, d.quotes, d.invoices, d.reminders);
    return reply({ version: 1, rows, truncated: d.truncated, quotes_without_task: d.quotes_without_task });
  } catch { return reply({ error: 'Journeygegevens ophalen mislukt.' }, 500); }
}
