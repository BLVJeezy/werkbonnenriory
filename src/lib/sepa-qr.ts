// ============= EPC069-08 SEPA payment QR =============
// Pure: builds the payment-code text that Belgian banking apps scan to pre-fill a transfer.
// No payment provider, no card fees: the customer's own bank does the transfer.
import { invoicePaymentReference } from './invoice-payment-reference';

export type SepaQrInput = {
  /** Name of the receiving business, shown to the customer. */
  serviceName: string;
  iban: string;
  bic?: string | null;
  /** Amount still owed, in EUR. */
  amount: number;
  /** Invoice number; ends up in the transfer communication so Ponto can match it. */
  reference: string;
};

const clean = (s: string) => s.replace(/[\r\n]/g, " ").trim();
const clip = (s: string, n: number) => clean(s).slice(0, n);

/** Open amount of an invoice, rounded to the cent. */
export function openAmount(total: number, paid: number): number {
  return Math.round((total - paid) * 100) / 100;
}

/**
 * Builds an EPC069-08 v2 payload (UTF-8, SCT). Belgian OGM goes in the
 * unstructured field: the structured EPC field only accepts ISO 11649 RF references.
 */
export function buildSepaQr(input: SepaQrInput): string {
  const iban = input.iban.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) throw new Error("Ongeldig IBAN");
  const amount = openAmount(input.amount, 0);
  if (amount <= 0) throw new Error("Bedrag moet groter dan nul zijn");
  const communication = clip(invoicePaymentReference(input.reference), 140);
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    clip(input.bic ?? "", 35),
    clip(input.serviceName, 70),
    clip(iban, 35),
    clip(`EUR${amount.toFixed(2)}`, 13),
    "",
    "",
    communication,
    "",
  ].join("\n");
}

/** Human-readable payment data to paste into a mail or a chat message. */
export function paymentText(input: SepaQrInput): string {
  const amount = openAmount(input.amount, 0);
  return [
    `Te betalen: EUR ${amount.toFixed(2)}`,
    `Ontvanger: ${clean(input.serviceName)}`,
    `IBAN: ${input.iban.replace(/[\s-]/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim()}`,
    input.bic ? `BIC: ${clean(input.bic).toUpperCase()}` : "",
    `Mededeling: ${invoicePaymentReference(input.reference)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
