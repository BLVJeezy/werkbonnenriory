import { linkText } from "./document-tracking";
import { werkbonNr } from "./werkbon-number";
import { brandedBody } from "./mail-html";
import { appendTermsPdf } from "./terms-pdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { werkbonMailData } from "./werkbon-mail";
import { RIORY_LOGO_PNG_BASE64 } from "./riory-logo";

type WerkbonData = ReturnType<typeof werkbonMailData>;

const W = 595.28, H = 841.89, M = 48;

/** Pure, Worker-compatible PDF in the riory.be house style; only allowlisted fields (paid amount if paid, no rates or line prices). */
export async function createWerkbonPdf(data: WerkbonData, photos: readonly Uint8Array[] = []): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(RIORY_LOGO_PNG_BASE64);
  const ink = rgb(0.118, 0.18, 0.204); // #1e2e34
  const orange = rgb(0.953, 0.573, 0); // #f39200
  const muted = rgb(0.42, 0.46, 0.48);
  const soft = rgb(0.996, 0.957, 0.902);
  const printable = (text: string) => [...text].map((c) => {
    try { font.encodeText(c); return c; } catch { return "?"; }
  }).join("");
  const wrap = (text: string, size: number, width: number, f = font) => {
    const out: string[] = [];
    for (const block of text.split(/\r?\n/)) {
      const clean = printable(block);
      let cur = "";
      for (const word of clean.split(" ")) {
        const t = cur ? `${cur} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = word; } else cur = t;
      }
      out.push(cur);
    }
    return out;
  };

  let page = doc.addPage([W, H]);
  let y = 0;
  const footer = () => {
    page.drawRectangle({ x: 0, y: 0, width: W, height: 34, color: ink });
    page.drawText("Riory  -  Natveld 47, 3740 Bilzen  -  info@riory.be  -  www.riory.be", { x: M, y: 13, size: 8.5, font, color: rgb(1, 1, 1) });
  };
  const header = (first: boolean) => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: orange });
    const lw = first ? 170 : 110;
    page.drawImage(logo, { x: M, y: H - 30 - lw * (logo.height / logo.width), width: lw, height: lw * (logo.height / logo.width) });
    footer();
    y = first ? H - 90 : H - 70;
  };
  const ensure = (h: number) => { if (y - h < 56) { page = doc.addPage([W, H]); header(false); } };
  header(true);

  // Title block, right aligned
  const title = "WERKBON";
  page.drawText(title, { x: W - M - bold.widthOfTextAtSize(title, 22), y: H - 50, size: 22, font: bold, color: ink });
  const nr = werkbonNr(data.number);
  page.drawText(nr, { x: W - M - bold.widthOfTextAtSize(nr, 14), y: H - 68, size: 14, font: bold, color: orange });
  if (data.signedAt) {
    const d = new Date(data.signedAt).toLocaleDateString("nl-BE", { timeZone: "Europe/Brussels" });
    page.drawText(d, { x: W - M - font.widthOfTextAtSize(d, 10), y: H - 82, size: 10, font, color: muted });
  }
  y -= 10;

  const section = (label: string) => {
    ensure(40);
    y -= 14;
    page.drawRectangle({ x: M, y: y - 3, width: 4, height: 14, color: orange });
    page.drawText(printable(label.toUpperCase()), { x: M + 10, y, size: 11, font: bold, color: ink });
    y -= 20;
  };
  const kv = (label: string, value: string, x = M, width = W - 2 * M) => {
    const lines = wrap(value, 10.5, width - 120);
    ensure(lines.length * 14 + 4);
    page.drawText(printable(label), { x, y, size: 9, font: bold, color: muted });
    lines.forEach((l, i) => page.drawText(l, { x: x + 120, y: y - i * 14, size: 10.5, font, color: ink }));
    y -= lines.length * 14 + 4;
  };

  section("Klant");
  kv("Naam", data.customer);
  if (data.vatNumber) kv("Btw-nummer", data.vatNumber);
  if (data.address) kv("Klantadres", data.address);
  if (data.siteAddress) kv("Werfadres", data.siteAddress);

  section("Interventie");
  if (data.activity) kv("Activiteit", data.activity);
  if (data.signedAt) kv("Datum", new Date(data.signedAt).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" }));
  const minutes = Math.round(data.seconds / 60);
  kv("Gewerkte tijd", `${Math.floor(minutes / 60)} u ${minutes % 60} min`);
  if (data.distanceKm != null) kv("Kilometers", `${data.distanceKm.toLocaleString("nl-BE")} km heen en terug`);
  if (data.warranty) kv("Garantie", "Ja, onder garantie");

  if (data.description) {
    section("Omschrijving");
    for (const l of wrap(data.description, 10.5, W - 2 * M)) { ensure(14); page.drawText(l, { x: M, y, size: 10.5, font, color: ink }); y -= 14; }
  }

  if (data.workNotes) {
    section("Uitgevoerde werken");
    for (const l of wrap(data.workNotes, 10.5, W - 2 * M)) { ensure(14); page.drawText(l, { x: M, y, size: 10.5, font, color: ink }); y -= 14; }
  }

  if (data.materials.length) {
    section("Materialen");
    ensure(22);
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: ink });
    page.drawText("AANTAL", { x: M + 8, y, size: 8.5, font: bold, color: rgb(1, 1, 1) });
    page.drawText("OMSCHRIJVING", { x: M + 100, y, size: 8.5, font: bold, color: rgb(1, 1, 1) });
    y -= 22;
    data.materials.forEach((m, i) => {
      const lines = wrap(m.name, 10, W - 2 * M - 110);
      const h = lines.length * 13 + 8;
      ensure(h);
      if (i % 2 === 0) page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: soft });
      page.drawText(printable(`${m.quantity.toLocaleString("nl-BE")} ${m.unit}`), { x: M + 8, y, size: 10, font, color: ink });
      lines.forEach((l, j) => page.drawText(l, { x: M + 100, y: y - j * 13, size: 10, font, color: ink }));
      y -= h;
    });
  }

  if (data.paid) {
    section("Betaling");
    ensure(50);
    page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 40, color: soft, borderColor: orange, borderWidth: 1.5 });
    const when = new Date(data.paid.at).toLocaleDateString("nl-BE", { timeZone: "Europe/Brussels" });
    page.drawText(printable(`Betaald${data.paid.method ? ` via ${data.paid.method}` : ""} op ${when}`), { x: M + 12, y: y - 10, size: 10.5, font, color: ink });
    const amt = `EUR ${data.paid.amount.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    page.drawText(amt, { x: W - M - 12 - bold.widthOfTextAtSize(amt, 16), y: y - 12, size: 16, font: bold, color: ink });
    y -= 44;
  }

  section("Aftekening");
  if (data.signature?.startsWith("data:image/png;base64,")) {
    const image = await doc.embedPng(data.signature);
    const scale = Math.min(220 / image.width, 90 / image.height);
    const h = image.height * scale;
    ensure(h + 30);
    page.drawImage(image, { x: M, y: y - h + 10, width: image.width * scale, height: h });
    y -= h + 4;
    page.drawLine({ start: { x: M, y }, end: { x: M + 230, y }, thickness: 0.8, color: muted });
    y -= 14;
  }
  ensure(16);
  page.drawText(printable(data.signedName ? `Afgetekend door ${data.signedName}` : data.paid ? "Afgesloten na betaling." : "Nog niet afgetekend."), { x: M, y, size: 10.5, font, color: ink });
  // Photo annex precedes the conditions; all photos belong to this same PDF snapshot.
  for (let i = 0; i < photos.length; i++) {
    const bytes = photos[i];
    if (!bytes) continue;
    const isPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const isJpeg = bytes[0] === 255 && bytes[1] === 216;
    if (!isPng && !isJpeg) throw new Error('Een foto heeft een niet-ondersteund formaat. Gebruik JPG of PNG voor de werkbon.');
    const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    if (i % 2 === 0) {
      page = doc.addPage([W, H]);
      header(false);
      section(`Foto’s - werkbon ${werkbonNr(data.number)}`);
    }
    const scale = Math.min((W - 2 * M) / image.width, 280 / image.height, 1);
    const width = image.width * scale, height = image.height * scale;
    page.drawText(`Foto ${i + 1} van ${photos.length}`, { x: M, y, size: 9, font, color: muted });
    page.drawImage(image, { x: M + (W - 2 * M - width) / 2, y: y - 12 - height, width, height });
    y -= 320;
  }
  await appendTermsPdf(doc);
  return doc.save();
}

/** Outlook file attachment: no public storage URL and no work-order details in the body. */
export function werkbonPdfMessage(data: WerkbonData, recipient: string, pdfBase64: string, docUrl?: string, signing?: { url: string; code: string }) {
  let text = `Beste klant,\n\nBedankt voor uw vertrouwen in Riory. In de bijlage vindt u uw werkbon ${werkbonNr(data.number)} als pdf.`;
  if (signing) {
    text += `\n\nU kunt de werkbon digitaal ondertekenen in minder dan een minuut:\n${signing.url}\n! Uw persoonlijke code: ${signing.code} — vul deze code in op de tekenpagina.`;
  }
  text += `\n\n✓ Ondertekenen kan op gsm, tablet of computer\n✓ U ontvangt meteen een bevestiging\n✓ Vragen? Antwoord gewoon op deze mail`;
  text += `\n\nMet vriendelijke groeten,\nRiory`;
  return {
    subject: `Werkbon ${werkbonNr(data.number)} — ${data.customer}`,
    body: brandedBody(docUrl ? linkText(text, docUrl) : text),
    toRecipients: [{ emailAddress: { address: recipient } }],
    attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: `Werkbon-${data.number ?? "nieuw"}.pdf`, contentType: "application/pdf", contentBytes: pdfBase64 }],
  };
}