import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { werkbonMailData } from "./werkbon-mail";

type WerkbonData = ReturnType<typeof werkbonMailData>;

/** Pure, Worker-compatible PDF generation using only the price-free allowlist. */
export async function createWerkbonPdf(data: WerkbonData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.12, 0.12);
  let page = doc.addPage([595.28, 841.89]);
  let y = 790;
  // Standard PDF fonts support WinAnsi. Preserve supported accents; safely substitute unsupported characters.
  const printable = (text: string) => [...text].map((c) => {
    try { font.encodeText(c); return c; } catch { return "?"; }
  }).join("");
  const line = (text: string, heading = false) => {
    const size = heading ? 16 : 11;
    if (y < 60) { page = doc.addPage([595.28, 841.89]); y = 790; }
    page.drawText(printable(text), { x: 48, y, size, font: heading ? bold : font, color: ink });
    y -= heading ? 26 : 17;
  };
  const paragraph = (text: string) => {
    for (const block of text.split(/\r?\n/)) {
      let current = "";
      for (const char of printable(block)) {
        if (font.widthOfTextAtSize(current + char, 11) > 495) { line(current); current = ""; }
        current += char;
      }
      line(current);
    }
  };
  line("RIORY WERKBONNEN", true);
  line(`Werkbon #${data.number}`, true);
  paragraph(`Klant: ${data.customer}`);
  if (data.vatNumber) paragraph(`Btw-nummer klant: ${data.vatNumber}`);
  if (data.address) paragraph(`Klantadres: ${data.address}`);
  if (data.siteAddress) paragraph(`Werfadres: ${data.siteAddress}`);
  if (data.activity) paragraph(`Activiteit: ${data.activity}`);
  if (data.signedAt) paragraph(`Datum: ${new Date(data.signedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}`);
  y -= 12;
  if (data.description) { line("Omschrijving", true); paragraph(data.description); y -= 12; }
  const minutes = Math.round(data.seconds / 60);
  paragraph(`Gewerkte tijd: ${Math.floor(minutes / 60)} u ${minutes % 60} min`);
  if (data.distanceKm != null) paragraph(`Kilometers heen en terug: ${data.distanceKm.toLocaleString("nl-BE")} km`);
  if (data.warranty) paragraph("Onder garantie: Ja");
  if (data.materials.length) {
    y -= 12;
    line("Materialen", true);
    for (const m of data.materials) paragraph(`${m.quantity} ${m.unit} - ${m.name}`);
  }
  y -= 20;
  paragraph(data.signedName ? `Afgetekend door: ${data.signedName}` : "Afgesloten na betaling.");
  if (data.signature?.startsWith("data:image/png;base64,")) {
    const image = await doc.embedPng(data.signature);
    const scale = Math.min(240 / image.width, 100 / image.height);
    const height = image.height * scale;
    if (y < height + 60) { page = doc.addPage([595.28, 841.89]); y = 790; }
    page.drawImage(image, { x: 48, y: y - height, width: image.width * scale, height });
  }
  return doc.save();
}

/** Outlook file attachment: no public storage URL and no work-order details in the body. */
export function werkbonPdfMessage(data: WerkbonData, recipient: string, pdfBase64: string) {
  return {
    subject: `Werkbon #${data.number} — ${data.customer}`,
    body: { contentType: "Text", content: `Beste klant,\n\nIn de bijlage vindt u uw werkbon #${data.number} als pdf.\n\nBedankt voor uw vertrouwen.\n\nMet vriendelijke groeten,\nRiory` },
    toRecipients: [{ emailAddress: { address: recipient } }],
    attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: `Werkbon-${data.number}.pdf`, contentType: "application/pdf", contentBytes: pdfBase64 }],
  };
}