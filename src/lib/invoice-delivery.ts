import { linkText } from "./document-tracking";
import { brandedBody } from "./mail-html";
import type { InvoiceCustomer } from "./invoice";
import { INVOICE_MAILBOX_ADDRESS } from './mail-senders';

export const OKIOKI_INVOICE_EMAIL = "BE0840931404701144@okioki.app";

/** OkiOki only receives the UBL copy while the document is not yet delivered through Peppol. */
export function needsOkioki(peppolActive = false) {
  return !peppolActive;
}

/** What the admin is asked to confirm before a send goes out, so the wording never promises an OkiOki copy that is off. */
export function sendConfirmText(count: number, peppolActive: boolean) {
  return `${count} factuur/facturen nu verzenden? De klant krijgt de PDF${peppolActive
    ? "; Peppol is actief, er gaat geen kopie meer naar OkiOki."
    : `; bij een ingevuld btw-nummer gaat een aparte UBL-mail naar ${OKIOKI_INVOICE_EMAIL}.`}`;
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

/** One mail to the customer; OkiOki is only copied while Peppol delivery is not live yet. */
export async function deliverInvoice(o: {
  customer: Pick<InvoiceCustomer, "vatNumber" | "email">;
  pdfSent: boolean; okiokiSent: boolean;
  peppolActive?: boolean;
  sendWithCc: (to: string) => Promise<void>;
  sendUbl: (to: string) => Promise<void>;
  record: (leg: "pdf" | "okioki") => Promise<void>;
}) {
  const okioki = needsOkioki(o.peppolActive);
  if (!o.customer.email) throw new Error("Geen facturatie- of klantmailadres: vul dit eerst in");
  if (!o.pdfSent) {
    await o.sendWithCc(o.customer.email);
    await o.record("pdf");
    if (okioki) await o.record("okioki");
    return;
  }
  if (okioki && !o.okiokiSent) {
    await o.sendUbl(OKIOKI_INVOICE_EMAIL);
    await o.record("okioki");
  }
}
