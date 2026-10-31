import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createQuotePdf, type QuotePdfData } from "./quote-pdf";
import { RIORY_LOGO_PNG_BASE64 } from "./riory-logo";

const base: QuotePdfData = {
  number: "OFF-9", issueDate: "2026-10-31", validUntil: "2026-11-30",
  customer: { name: "Test", street: null, houseNumber: null, postalCode: null, city: null, address: null, siteAddress: null, vatNumber: null, email: null },
  lines: [], vatRate: 6, net: 0, vat: 0, total: 0,
  company: { name: "Riory bv", vat: "BE0840931404", iban: null, bic: null }, terms: null,
};

it("voegt bij een verzekeringsbestek de foto's toe, twee per pagina, vóór de voorwaarden", async () => {
  const photo = Uint8Array.from(atob(RIORY_LOGO_PNG_BASE64), (c) => c.charCodeAt(0));
  const plain = await PDFDocument.load(await createQuotePdf(base));
  const withPhotos = await PDFDocument.load(await createQuotePdf({ ...base, kind: "verzekering", damageCause: "Brand", damageFindings: "1. Roet" }, [photo, photo, photo]));
  expect(withPhotos.getPageCount() - plain.getPageCount()).toBe(2);
});

it("weigert een foto in een niet-ondersteund formaat", async () => {
  await expect(createQuotePdf({ ...base, kind: "verzekering" }, [new Uint8Array([1, 2, 3, 4])])).rejects.toThrow(/niet-ondersteund/);
});
