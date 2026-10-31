import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInvoicePdf, type InvoicePdfData } from "./invoice-pdf";
import { createQuotePdf, type QuotePdfData } from "./quote-pdf";

const out = "/tmp/browser/line-style";
const customer = {
  name: "Fam. Peeters", street: "Bloemenlaan", houseNumber: "12", postalCode: "3740", city: "Bilzen",
  address: null, siteAddress: null, vatNumber: null, email: "fam.peeters@example.com",
};
const company = { name: "Riory bv", vat: "BE0840931404", iban: "BE68 5390 0754 3029", bic: null };

const detail = "Put volledig leeggepompt en afgevoerd via een erkende verwerker.\nNadien de wanden en het filter met hogedruk gereinigd; de pompput is opnieuw in werking gesteld.\nControle van het debiet: geen verstopping meer vastgesteld.";

const invoice: InvoicePdfData = {
  number: "20260821", issueDate: "2026-10-31", dueDate: "2026-11-30", workOrderNumber: 85,
  customer, vatRate: 6, net: 465, vat: 27.9, total: 492.9, paidAmount: 0, company, terms: null,
  note: "De put liep volledig over na de zware regenval van vorige week.",
  lines: [
    { description: `Dieptereiniging regenput en pompput\n${detail}`, quantity: 1, unit: "st", unitPrice: 355, amount: 319.5, vatRate: 6, discount: 10, originalUnitPrice: 355, group: "Herstel regenput" },
    { description: "Drijvende aanzuigset regenput\nIncl. plaatsing en aanpassing van de slangaansluiting.", quantity: 1, unit: "st", unitPrice: 145.5, amount: 145.5, vatRate: 6, group: "Herstel regenput" },
  ],
};

const quote: QuotePdfData = {
  number: "OFF-9", issueDate: "2026-10-31", validUntil: "2026-11-30",
  customer, vatRate: 6, net: 355, vat: 21.3, total: 376.3, company, terms: null,
  intro: "Beste familie Peeters, hierbij onze offerte voor de gevraagde werken.",
  lines: [
    { description: `Dieptereiniging regenput en pompput\n${detail}`, quantity: 1, unit: "st", unitPrice: 355, amount: 355, vatRate: 6 },
  ],
};

it("schrijft voorbeeld-pdf's naar schijf", async () => {
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/factuur.pdf`, await createInvoicePdf(invoice));
  writeFileSync(`${out}/offerte.pdf`, await createQuotePdf(quote));
});
