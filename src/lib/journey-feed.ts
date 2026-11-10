import { z } from 'zod';

/**
 * Customer-journey feed for the riory.be admin ("Werkingsproces").
 * Shares no names, addresses, prices or photos: customers are identified only by
 * SHA-256 hashes of a normalised e-mail address and phone number, so the website
 * can match its own form submissions without either side exposing contact data.
 */

export const journeyInput = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }).optional(),
});
export type JourneyInput = z.infer<typeof journeyInput>;

export const JOURNEY_MAX_ROWS = 5000;

export const normEmail = (v: string | null | undefined) => {
  const e = (v ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};

/** Last nine digits: identical for +32 470…, 0032 470… and 0470…. */
export const normPhone = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-9) : null;
};

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function contactHashes(emails: (string | null | undefined)[], phones: (string | null | undefined)[]) {
  const e = [...new Set(emails.map(normEmail).filter((x): x is string => !!x))];
  const p = [...new Set(phones.map(normPhone).filter((x): x is string => !!x))];
  return {
    e: await Promise.all(e.map((x) => sha256(`email:${x}`))),
    p: await Promise.all(p.map((x) => sha256(`tel:${x}`))),
  };
}

export type JourneyWorkOrder = {
  id: string; created_at: string; received_at: string | null; status: string | null;
  email: string | null; billing_email: string | null; phone: string | null;
  urgent: boolean | null; first_customer: boolean | null; warranty: boolean | null; no_invoice: boolean | null;
  not_needed: boolean | null; contract_id: string | null; syndicus: string | null; technician_id: string | null;
  scheduled_date: string | null; quote_pending: boolean | null; quote_approved: boolean | null;
  signed_at: string | null; paid_at: string | null; paid_amount: number | null;
  source_message_id: string | null;
};
export type JourneyQuote = {
  id: string; kind: string | null; status: string | null; sent_at: string | null; signed_at: string | null;
  reminder_stage: number | null; work_order_id: string | null; source_work_order_id: string | null; created_at: string;
};
export type JourneyInvoice = {
  id: string; kind: string | null; status: string | null; sent_at: string | null; sent_via: string | null;
  peppol_sent_at: string | null; post_sent_at: string | null; due_date: string | null; paid_at: string | null;
  paid_amount: number | null; total: number | null; work_order_id: string | null; extra_work_order_ids: string[] | null;
  credit_for: string | null;
};
export type JourneyReminder = { invoice_id: string; stage: number; status: string | null };

export type JourneyRow = {
  id: string;
  at: string;
  h: { e: string[]; p: string[] };
  bron: 'mail' | 'manueel' | 'contract';
  status: string | null;
  dringend: boolean; eerste_klant: boolean; garantie: boolean; syndicus: boolean;
  ingepland: boolean;
  afgesloten: 'afgetekend' | 'afgerekend' | null;
  niet_factureren: boolean;
  offerte: null | { status: string | null; verzonden: boolean; getekend: boolean; herinnering: number; verzekering: boolean };
  factuur: null | {
    verzonden: boolean; via: 'peppol' | 'post' | 'mail' | null; betaald: boolean; vervallen: boolean;
    herinnering: number; creditnota: boolean;
  };
};

const isPaid = (i: JourneyInvoice) =>
  i.status === 'betaald' || !!i.paid_at || (i.total != null && i.total > 0 && (i.paid_amount ?? 0) >= i.total - 0.005);

export async function buildJourneyRows(
  orders: JourneyWorkOrder[], quotes: JourneyQuote[], invoices: JourneyInvoice[], reminders: JourneyReminder[],
  today = new Date().toISOString().slice(0, 10),
): Promise<JourneyRow[]> {
  const quoteFor = new Map<string, JourneyQuote>();
  for (const q of [...quotes].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    for (const id of [q.work_order_id, q.source_work_order_id]) if (id) quoteFor.set(id, q);
  }
  const reminderStage = new Map<string, number>();
  for (const r of reminders) {
    if (r.status && !['accepted', 'sent', 'verzonden'].includes(r.status)) continue;
    reminderStage.set(r.invoice_id, Math.max(reminderStage.get(r.invoice_id) ?? 0, r.stage));
  }
  const credited = new Set(invoices.filter((i) => i.kind === 'creditnota' && i.credit_for).map((i) => i.credit_for!));
  const invoiceFor = new Map<string, JourneyInvoice>();
  for (const i of invoices) {
    if (i.kind === 'creditnota') continue;
    for (const id of [i.work_order_id, ...(i.extra_work_order_ids ?? [])]) if (id) invoiceFor.set(id, i);
  }

  return Promise.all(orders.map(async (o): Promise<JourneyRow> => {
    const q = quoteFor.get(o.id);
    const inv = invoiceFor.get(o.id);
    const paidOnSite = !!o.paid_at || (o.paid_amount ?? 0) > 0;
    const done = o.status === 'afgetekend' || !!o.signed_at || paidOnSite;
    return {
      id: o.id,
      at: o.received_at ?? o.created_at,
      h: await contactHashes([o.email, o.billing_email], [o.phone]),
      bron: o.contract_id ? 'contract' : o.source_message_id ? 'mail' : 'manueel',
      status: o.status,
      dringend: !!o.urgent, eerste_klant: !!o.first_customer, garantie: !!o.warranty,
      syndicus: !!o.syndicus?.trim(),
      ingepland: !!o.scheduled_date && !!o.technician_id,
      afgesloten: !done ? null : paidOnSite && !o.signed_at ? 'afgerekend' : 'afgetekend',
      niet_factureren: !!o.no_invoice || !!o.not_needed,
      offerte: q ? {
        status: q.status, verzonden: !!q.sent_at, getekend: !!q.signed_at || q.status === 'akkoord',
        herinnering: q.reminder_stage ?? 0, verzekering: q.kind === 'verzekering',
      } : null,
      factuur: inv ? {
        verzonden: !!inv.sent_at,
        via: inv.peppol_sent_at || inv.sent_via === 'peppol' ? 'peppol' : inv.post_sent_at ? 'post' : inv.sent_at ? 'mail' : null,
        betaald: isPaid(inv),
        vervallen: !isPaid(inv) && !!inv.due_date && inv.due_date < today && !!inv.sent_at,
        herinnering: reminderStage.get(inv.id) ?? 0,
        creditnota: credited.has(inv.id),
      } : null,
    };
  }));
}
