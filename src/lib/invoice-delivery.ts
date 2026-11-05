import { linkText } from "./document-tracking";
import { brandedBody } from "./mail-html";
import type { InvoiceCustomer } from "./invoice";
import { INVOICE_MAILBOX_ADDRESS } from './mail-senders';

export const OKIOKI_INVOICE_EMAIL = "BE0840931404701144@okioki.app";

/** OkiOki only receives the UBL copy while the document is not yet delivered through Peppol. */
export function needsOkioki(peppolActive = false) {
  return !peppolActive;
}

type Att = { name: string; contentType: string; contentBytes: string };
const file = (a: Att) => ({ "@odata.type": "#microsoft.graph.fileAttachment", ...a });

export function invoiceMail(to: string, number: string, contentBytes: string, format: "pdf" | "ubl", label = "Factuur", docUrl?: string, paid = false) {
  const text = paid
    ? `Beste klant,\n\nBedankt voor uw vertrouwen in Riory. In de bijlage vindt u ${label.toLowerCase()} ${number} als pdf.\n\n✓ Deze ${label.toLowerCase()} is al betaald — bedankt!\n✓ U hoeft verder niets te doen\n✓ Vragen? Antwoord gewoon op deze mail\n\nMet vriendelijke groeten,\nRiory`
    : `Beste klant,\n\nBedankt voor uw vertrouwen in Riory. In de bijlage vindt u ${label.toLowerCase()} ${number} als pdf.\n\n✓ Betalen kan eenvoudig met de betaalcode op de factuur\n✓ U ontvangt een bevestiging zodra uw betaling verwerkt is\n✓ Vragen? Antwoord gewoon op deze mail\n\nMet vriendelijke groeten,\nRiory`;
  return { message: {
    subject: `${label} ${number} — Riory`,
    body: format === "pdf"
      ? brandedBody(docUrl ? linkText(text, docUrl) : text, INVOICE_MAILBOX_ADDRESS)
      : { contentType: "Text", content: `${label} ${number} in UBL-formaat voor verwerking via OkiOki.` },
    toRecipients: [{ emailAddress: { address: to } }],
    attachments: [file({ name: `${label}-${number}.${format === "pdf" ? "pdf" : "xml"}`, contentType: format === "pdf" ? "application/pdf" : "application/xml", contentBytes })],
  } };
}

/** Customer mail with PDF + UBL, OkiOki in BCC so the customer cannot see it. With okioki off (Peppol live) no copy goes out. */
export function invoiceMailWithCc(to: string, number: string, pdfBytes: string, ublBytes: string, label = "Factuur", docUrl?: string, paid = false, okioki = true) {
  const m = invoiceMail(to, number, pdfBytes, "pdf", label, docUrl, paid);
  return { message: { ...m.message,
    // Outlook asks the customer's mail program for a read receipt; the customer may decline, so absence never means "unread".
    isReadReceiptRequested: true,
    ...(okioki ? { bccRecipients: [{ emailAddress: { address: OKIOKI_INVOICE_EMAIL } }] } : {}),
    attachments: [...m.message.attachments, file({ name: `${label}-${number}.xml`, contentType: "application/xml", contentBytes: ublBytes })],
  } };
}

/** One mail to the customer with OkiOki in CC; a retry after an older PDF-only send just sends the UBL to OkiOki. */
export async function deliverInvoice(o: {
  customer: Pick<InvoiceCustomer, "vatNumber" | "email">;
  pdfSent: boolean; okiokiSent: boolean;
  sendWithCc: (to: string) => Promise<void>;
  sendUbl: (to: string) => Promise<void>;
  record: (leg: "pdf" | "okioki") => Promise<void>;
}) {
  if (!o.customer.email) throw new Error("Geen facturatie- of klantmailadres: vul dit eerst in");
  if (!o.pdfSent) {
    await o.sendWithCc(o.customer.email);
    await o.record("pdf");
    await o.record("okioki");
    return;
  }
  if (!o.okiokiSent) {
    await o.sendUbl(OKIOKI_INVOICE_EMAIL);
    await o.record("okioki");
  }
}
