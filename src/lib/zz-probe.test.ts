import { it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFRef } from "pdf-lib";
import { createInvoicePdf, type InvoicePdfData } from "./invoice-pdf";

const line = { description: "Dieptereiniging regenput\nPut leeggepompt en met hogedruk gereinigd.", quantity: 2, unit: "st", unitPrice: 100, amount: 200 };
const invoice: InvoicePdfData = {
  number: "20260821", issueDate: "2026-10-31", dueDate: "2026-11-30", workOrderNumber: 7,
  customer: { name: "Test", address: null, siteAddress: null, vatNumber: null, email: null },
  lines: [{ ...line, vatRate: 21 }], vatRate: 21, net: 200, vat: 42, total: 242, paidAmount: 0,
  company: { name: "Riory bv", vat: "BE0840931404", iban: null, bic: null }, terms: null,
};

it("probe", async () => {
  const bytes = await createInvoicePdf(invoice);
  const doc = await PDFDocument.load(bytes);
  const c = doc.getPage(0).node.Contents();
  const items = c instanceof PDFArray ? c.asArray() : [c];
  const s = items[0] instanceof PDFRef ? doc.context.lookup(items[0]) : items[0];
  const text = new TextDecoder("latin1").decode(inflateSync((s as any).contents));
  const i = text.indexOf("Tf");
  console.log("TJCONTEXT>>>", JSON.stringify(text.slice(i - 120, i + 320)));
  console.log("MATCHES", [...text.matchAll(/\/(F\d+)\s+([\d.]+)\s+Tf|\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].length);
  console.log("FINDTJ", text.includes("Tj"), "FINDTJ2", text.includes("TJ"));
});
