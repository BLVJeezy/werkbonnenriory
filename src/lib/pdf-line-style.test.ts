import { expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";
import { createInvoicePdf, type InvoicePdfData } from "./invoice-pdf";
import { createQuotePdf, type QuotePdfData } from "./quote-pdf";

type Drawn = { text: string; baseFont: string; size: string; order: number };

const deref = (doc: PDFDocument, value: unknown) => (value instanceof PDFRef ? doc.context.lookup(value) : value);

/** Reads every text run of a PDF page together with the font and size that was active when it was drawn. */
async function drawnText(bytes: Uint8Array, pageIndex = 0): Promise<Drawn[]> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  const items = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  const raw = items
    .map((item) => {
      const stream = deref(doc, item) as { contents?: Uint8Array };
      const data = stream.contents ?? new Uint8Array();
      try {
        return new TextDecoder("latin1").decode(inflateSync(data));
      } catch {
        return new TextDecoder("latin1").decode(data);
      }
    })
    .join("\n");

  const resources = deref(doc, page.node.Resources());
  const fontDict = resources instanceof PDFDict ? deref(doc, resources.lookup(PDFName.of("Font"))) : undefined;
  const baseFonts = new Map<string, string>();
  if (fontDict instanceof PDFDict) {
    for (const [name, ref] of fontDict.entries()) {
      const obj = deref(doc, ref);
      const baseFont = obj instanceof PDFDict ? obj.get(PDFName.of("BaseFont")) : undefined;
      baseFonts.set(String(name).replace(/^\//, ""), baseFont ? String(baseFont) : "");
    }
  }

  const out: Drawn[] = [];
  let font = "", size = "", order = 0;
  for (const m of raw.matchAll(/\/(F\d+)\s+([\d.]+)\s+Tf|\(((?:[^()\\]|\\.)*)\)\s*Tj/g)) {
    if (m[1]) { font = m[1]; size = m[2]; continue; }
    out.push({ text: m[2] ?? "", baseFont: baseFonts.get(font) ?? "", size, order: order++ });
  }
  return out;
}

const line = { description: "Dieptereiniging regenput\nPut leeggepompt en met hogedruk gereinigd.", quantity: 2, unit: "st", unitPrice: 100, amount: 200 };
const customer = { name: "Test", address: null, siteAddress: null, vatNumber: null, email: null };
const company = { name: "Riory bv", vat: "BE0840931404", iban: null, bic: null };

const invoice: InvoicePdfData = {
  number: "20260821", issueDate: "2026-10-31", dueDate: "2026-11-30", workOrderNumber: 7,
  customer, lines: [{ ...line, vatRate: 21 }], vatRate: 21, net: 200, vat: 42, total: 242, paidAmount: 0,
  company, terms: null,
};
const quote: QuotePdfData = {
  number: "OFF-9", issueDate: "2026-10-31", validUntil: "2026-11-30",
  customer, lines: [line], vatRate: 6, net: 200, vat: 12, total: 212,
  company, terms: null,
};

for (const [label, make] of [["factuur", () => createInvoicePdf(invoice)], ["offerte", () => createQuotePdf(quote)]] as const) {
  it(`zet op de ${label} de productnaam vet en de lange omschrijving eronder in een kleiner lettertype`, async () => {
    const drawn = await drawnText(await make());
    const title = drawn.find((d) => d.text.includes("Dieptereiniging regenput"));
    const detail = drawn.find((d) => d.text.includes("hogedruk"));
    expect(title, "productnaam staat op het document").toBeDefined();
    expect(detail, "lange omschrijving staat op het document").toBeDefined();
    expect(title!.baseFont).toMatch(/Bold/);
    expect(detail!.baseFont).not.toMatch(/Bold/);
    expect(Number(detail!.size)).toBeLessThan(Number(title!.size));
    expect(detail!.order).toBeGreaterThan(title!.order);
  });
}

it("breekt een lange factuurlijst op zonder posten te verliezen", async () => {
  const many: InvoicePdfData = {
    ...invoice,
    lines: Array.from({ length: 12 }, (_, i) => ({ ...line, description: `Lijn ${i + 1}\nBijvoegsel met wat langere tekst die nog wat woorden bevat.` })),
  };
  const bytes = await createInvoicePdf(many);
  const doc = await PDFDocument.load(bytes);
  const pages: string[] = [];
  for (let i = 0; i < doc.getPageCount(); i++) pages.push((await drawnText(bytes, i)).map((d) => d.text).join(" "));
  expect(doc.getPageCount()).toBeGreaterThan(10); // de voorwaarden volgen na de factuurpagina's
  expect(pages.join(" ")).toContain("Lijn 12");
  expect(pages.join(" ")).toContain("Bijvoegsel met wat langere tekst");
});
