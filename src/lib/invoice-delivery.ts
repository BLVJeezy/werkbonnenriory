import type { InvoiceCustomer } from "./invoice";

export const OKIOKI_INVOICE_EMAIL = "BE0840931404701144@okioki.app";

export function needsOkioki(customer: Pick<InvoiceCustomer, "vatNumber">) {
  return Boolean(customer.vatNumber?.trim());
}

export function invoiceMail(to: string, number: string, contentBytes: string, format: "pdf" | "ubl") {
  return { message: {
    subject: `Factuur ${number} — Riory`,
    body: { contentType: "Text", content: format === "pdf"
      ? `Beste klant,\n\nIn de bijlage vindt u factuur ${number} als pdf.\n\nBedankt voor uw vertrouwen.\n\nMet vriendelijke groeten,\nRiory`
      : `Factuur ${number} in UBL-formaat voor verwerking via OkiOki.` },
    toRecipients: [{ emailAddress: { address: to } }],
    attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: `Factuur-${number}.${format === "pdf" ? "pdf" : "xml"}`, contentType: format === "pdf" ? "application/pdf" : "application/xml", contentBytes }],
  } };
}

/** Persist each accepted mail before the next leg, so retries skip completed deliveries. */
export async function deliverInvoice(o: {
  customer: Pick<InvoiceCustomer, "vatNumber" | "email">;
  pdfSent: boolean; okiokiSent: boolean;
  sendPdf: (to: string) => Promise<void>;
  sendUbl: (to: string) => Promise<void>;
  record: (leg: "pdf" | "okioki") => Promise<void>;
}) {
  if (!o.customer.email) throw new Error("Geen facturatie- of klantmailadres: vul dit eerst in");
  if (!o.pdfSent) {
    await o.sendPdf(o.customer.email);
    await o.record("pdf");
  }
  if (needsOkioki(o.customer) && !o.okiokiSent) {
    await o.sendUbl(OKIOKI_INVOICE_EMAIL);
    await o.record("okioki");
  }
}