import { PDFDocument } from "pdf-lib";
import { TERMS_PDF_BASE64 } from "./terms-pdf-data";

/** Plakt de algemene voorwaarden (pdf) als laatste pagina's in het document. */
export async function appendTermsPdf(doc: PDFDocument): Promise<void> {
  const terms = await PDFDocument.load(TERMS_PDF_BASE64);
  const pages = await doc.copyPages(terms, terms.getPageIndices());
  for (const p of pages) doc.addPage(p);
}
