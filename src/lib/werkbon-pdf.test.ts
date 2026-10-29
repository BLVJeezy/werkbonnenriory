import { expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { werkbonMailData } from "./werkbon-mail";
import { createWerkbonPdf, werkbonPdfMessage } from "./werkbon-pdf";

const data = werkbonMailData({ number: 42, customer_name: "Testklant", address: "Klantstraat 1", description: "Herstelling uitgevoerd", signed_at: "2026-10-27T08:00:00Z", signed_name: "Testklant", distance_km: 20, warranty: false, vat_number: "BE 0123.456.789" }, "Herstelling", 4200, [{ name: "Buis", quantity: 2, unit: "m" }]);

it("creates a valid PDF attachment rather than an inline work order", async () => {
  const bytes = await createWerkbonPdf(data);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(10); // 1 werkbonpagina + 9 pagina's algemene voorwaarden
  const message = werkbonPdfMessage(data, "test@example.test", "PDF_BASE64");
  expect(message.attachments).toEqual([{ "@odata.type": "#microsoft.graph.fileAttachment", name: "Werkbon-42.pdf", contentType: "application/pdf", contentBytes: "PDF_BASE64" }]);
  expect(message.body.content).not.toContain("Herstelling uitgevoerd");
  expect(message.body.content).not.toContain("Klantstraat");
});

it("keeps long work orders readable across multiple pages", async () => {
  const bytes = await createWerkbonPdf({ ...data, description: "Uitgevoerd werk\n".repeat(150) });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
});

it("includes every intervention photo in the PDF attached to the customer mail, before the nine conditions pages", async () => {
  const { RIORY_LOGO_PNG_BASE64 } = await import('./riory-logo');
  const photo = Uint8Array.from(atob(RIORY_LOGO_PNG_BASE64), c => c.charCodeAt(0));
  const bytes = await createWerkbonPdf(data, [photo, photo, photo]);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(12);
  const imageCounts = doc.getPages().slice(1, 3).map(page => {
    const objects = page.node.Resources()?.lookup(PDFName.of('XObject'));
    return objects && 'keys' in objects ? (objects.keys as () => unknown[])().length : 0;
  });
  expect(imageCounts).toEqual([3, 2]); // logo + two photos, logo + one photo
  const base64 = Buffer.from(bytes).toString('base64');
  const message = werkbonPdfMessage(data, 'test@example.test', base64);
  expect(message.attachments[0]?.contentBytes).toBe(base64);
});

it("does not silently send a PDF missing an unsupported photo", async () => {
  await expect(createWerkbonPdf(data, [new Uint8Array([1, 2, 3])])).rejects.toThrow('niet-ondersteund formaat');
});