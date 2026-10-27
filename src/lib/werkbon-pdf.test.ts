import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
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