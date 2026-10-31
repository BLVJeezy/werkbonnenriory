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
  for (const item of items) {
    const s = item instanceof PDFRef ? doc.context.lookup(item) : item;
    console.log("ctor", s?.constructor?.name, "keys", Object.keys(s ?? {}).join(","));
    const data: Uint8Array = (s as any).contents ?? new Uint8Array();
    console.log("first bytes", Array.from(data.slice(0, 8)));
    let text = "";
    try { text = new TextDecoder("latin1").decode(inflateSync(data)); console.log("INFLATED"); }
    catch (e) { text = new TextDecoder("latin1").decode(data); console.log("RAWBECAUSE", (e as Error).message); }
    console.log("STREAMLEN", text.length);
    console.log("HEAD>>>", text.slice(0, 400));
  }
});
