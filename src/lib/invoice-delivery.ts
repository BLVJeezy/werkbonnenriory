import { brandedBody } from "./mail-html";
import type { InvoiceCustomer } from "./invoice";

export const OKIOKI_INVOICE_EMAIL = "BE0840931404701144@okioki.app";

/** Every invoice and credit note goes to OkiOki as UBL, also for private customers. */
export function needsOkioki(_customer?: Pick<InvoiceCustomer, "vatNumber">) {
  return true;
}

type Att = { name: string; contentType: string; contentBytes: string };
const file = (a: Att) => ({ "@odata.type": "#microsoft.graph.fileAttachment", ...a });

export function invoiceMail(to: string, number: string, contentBytes: string, format: "pdf" | "ubl", label = "Factuur") {
  return { message: {
    subject: `${label} ${number} — Riory`,
    body: format === "pdf"
      ? brandedBody(`Beste klant,\n\nIn de bijlage vindt u ${label.toLowerCase()} ${number} als pdf.\n\nBedankt voor uw vertrouwen.\n\nMet vriendelijke groeten,\nRiory`)
      : { contentType: "Text", content: `${label} ${number} in UBL-formaat voor verwerking via OkiOki.` },
    toRecipients: [{ emailAddress: { address: to } }],
    attachments: [file({ name: `${label}-${number}.${format === "pdf" ? "pdf" : "xml"}`, contentType: format === "pdf" ? "application/pdf" : "application/xml", contentBytes })],
  } };
}

/** Customer mail with PDF + UBL, OkiOki in BCC so the customer cannot see it. */
export function invoiceMailWithCc(to: string, number: string, pdfBytes: string, ublBytes: string, label = "Factuur") {
  const m = invoiceMail(to, number, pdfBytes, "pdf", label);
  return { message: { ...m.message,
    bccRecipients: [{ emailAddress: { address: OKIOKI_INVOICE_EMAIL } }],
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
