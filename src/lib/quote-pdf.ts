import { appendTermsPdf } from "./terms-pdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RIORY_LOGO_PNG_BASE64 } from "./riory-logo";
import type { InvoiceCustomer, InvoiceLine } from "./invoice";
import { splitLineText } from "./line-text";

export type QuotePdfData = {
  number: string; issueDate: string; validUntil: string;
  customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; net: number; vat: number; total: number;
  company: { name: string; vat: string; iban: string | null; bic: string | null }; terms: string | null;
  signedName?: string | null; signedAt?: string | null; intro?: string | null;
  /** 'verzekering' = bestek voor de brandverzekering, met oorzaak, vaststellingen en foto's. */
  kind?: string; damageCause?: string | null; damageFindings?: string | null;
  productPhotos?: Record<string, Uint8Array>;
};

/** Embeds JPG/PNG bytes; other formats cannot go in the PDF. */
export function photoKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "png";
  if (bytes[0] === 255 && bytes[1] === 216) return "jpg";
  return null;
}

const W = 595.28, H = 841.89, M = 48;
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `EUR ${n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-BE");

/** Worker-compatible quote PDF in the riory.be style, with the general terms appended on their own pages. */
export async function createQuotePdf(d: QuotePdfData, photos: readonly Uint8Array[] = []): Promise<Uint8Array> {
  const bestek = d.kind === "verzekering";
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(RIORY_LOGO_PNG_BASE64);
  const ink = rgb(0.118, 0.18, 0.204), orange = rgb(0.953, 0.573, 0), muted = rgb(0.42, 0.46, 0.48), soft = rgb(0.996, 0.957, 0.902), white = rgb(1, 1, 1), annex = rgb(0.945, 0.78, 0.55);
  const pr = (t: string) => [...t].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const wrap = (text: string, size: number, width: number, f = font) => {
    const out: string[] = [];
    for (const block of text.split(/\r?\n/)) {
      const clean = pr(block);
      let cur = "";
      for (const w of clean.split(" ")) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t; }
      out.push(cur);
    }
    return out;
  };
  let page = doc.addPage([W, H]);
  let y = 0;
  const chrome = (first: boolean) => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: orange });
    const lw = first ? 160 : 100, lh = lw * (logo.height / logo.width);
    page.drawImage(logo, { x: M, y: H - 30 - lh, width: lw, height: lh });
    page.drawRectangle({ x: 0, y: 0, width: W, height: 34, color: ink });
    page.drawText(pr(`${d.company.name}  -  Natveld 47, 3740 Bilzen  -  ${d.company.vat}  -  info@riory.be  -  www.riory.be`), { x: M, y: 13, size: 8, font, color: white });
    y = first ? H - 120 : H - 80;
  };
  const ensure = (h: number) => { if (y - h < 56) { page = doc.addPage([W, H]); chrome(false); } };
  const right = (t: string, x: number, yy: number, size: number, f = font, color = ink) => page.drawText(pr(t), { x: x - f.widthOfTextAtSize(pr(t), size), y: yy, size, font: f, color });
  chrome(true);

  right(bestek ? "BESTEK" : "OFFERTE", W - M, H - 50, 22, bold);
  right(d.number, W - M, H - 68, 14, bold, orange);
  right(`Datum ${date(d.issueDate)}`, W - M, H - 84, 9.5, font, muted);
  right(`Geldig tot ${date(d.validUntil)}`, W - M, H - 97, 9.5, font, muted);

  // Customer block on a soft orange panel
  const c = d.customer;
  const cust = [c.name, c.street ? `${c.street} ${c.houseNumber ?? ""}`.trim() : c.address ?? "", [c.postalCode, c.city].filter(Boolean).join(" "), c.vatNumber ? `Btw ${c.vatNumber}` : ""].filter(Boolean);
  const panelH = cust.length * 14 + (c.siteAddress ? 14 : 0) + 26;
  page.drawRectangle({ x: M, y: y - panelH + 10, width: W - 2 * M, height: panelH, color: soft });
  page.drawRectangle({ x: M, y: y - panelH + 10, width: 4, height: panelH, color: orange });
  page.drawText(bestek ? "BESTEK VOOR" : "OFFERTE VOOR", { x: M + 14, y: y - 4, size: 8.5, font: bold, color: muted });
  cust.forEach((l, i) => page.drawText(pr(l), { x: M + 14, y: y - 18 - i * 14, size: i === 0 ? 11.5 : 10.5, font: i === 0 ? bold : font, color: ink }));
  if (c.siteAddress) page.drawText(pr(`Werfadres: ${c.siteAddress}`), { x: M + 14, y: y - 18 - cust.length * 14, size: 9.5, font, color: muted });
  y -= panelH + 14;

  if (d.intro?.trim()) {
    const ls = wrap(d.intro, 10.5, W - 2 * M - 24);
    ensure(ls.length * 14 + 26);
    page.drawText("BETREFT", { x: M, y, size: 8.5, font: bold, color: orange });
    y -= 15;
    ls.forEach((t) => { page.drawText(t, { x: M, y, size: 10.5, font, color: ink }); y -= 14; });
    y -= 12;
  } else {
    y -= 8;
  }

  const block = (title: string, text: string | null | undefined) => {
    if (!text?.trim()) return;
    const ls = wrap(text, 10.5, W - 2 * M - 24);
    ensure(Math.min(ls.length, 4) * 14 + 26);
    page.drawText(title, { x: M, y, size: 8.5, font: bold, color: orange });
    y -= 15;
    ls.forEach((t) => { ensure(14); page.drawText(t, { x: M, y, size: 10.5, font, color: ink }); y -= 14; });
    y -= 12;
  };
  if (bestek) {
    block("OORZAAK VAN DE SCHADE", d.damageCause);
    block("VASTSTELLINGEN", d.damageFindings);
  }

  const cols = { desc: M + 8, qty: W - M - 250, price: W - M - 100, amt: W - M - 8 };
  const productImages = new Map();
  for (const [path, bytes] of Object.entries(d.productPhotos ?? {})) {
    const kind = photoKind(bytes);
    if (!kind) throw new Error("Een productfoto heeft een ongeldig formaat. Gebruik JPG of PNG.");
    productImages.set(path, kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
  }
  const mainLines = d.lines.filter((l) => !l.optional);
  const optionLines = d.lines.filter((l) => l.optional);
  const drawLines = (rows: InvoiceLine[]) => {
    rows.forEach((l, i) => {
      const w = cols.qty - cols.desc - 20;
      const { title, detail } = splitLineText(l.description);
      const tl = wrap(title, 10.5, w, bold);
      const dl = detail ? wrap(detail, 9, w - 14) : [];
      const h = tl.length * 14 + (dl.length ? 5 + dl.length * 11.5 : 0) + 10;
      ensure(h);
      if (i % 2 === 0) page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: soft });
      tl.forEach((t, j) => page.drawText(t, { x: cols.desc, y: y - j * 14, size: 10.5, font: bold, color: ink }));
      if (dl.length) {
        const top = y - tl.length * 14 - 5;
        page.drawRectangle({ x: cols.desc + 2, y: top - dl.length * 11.5 + 3, width: 2, height: dl.length * 11.5, color: annex, opacity: 0.6 });
        dl.forEach((t, j) => page.drawText(t, { x: cols.desc + 12, y: top - j * 11.5, size: 9, font, color: muted }));
      }
      right(`${l.quantity.toLocaleString("nl-BE")} ${l.unit}`, cols.qty + 40, y, 10);
      right(money(l.unitPrice), cols.price, y, 10);
      right(money(l.amount), cols.amt, y, 10);
      y -= h;
      for (const path of l.photoPaths ?? []) {
        const image = productImages.get(path);
        if (!image) throw new Error("Een productfoto ontbreekt in het offertevoorbeeld.");
        const scale = Math.min(180 / image.width, 130 / image.height, 1);
        const width = image.width * scale, height = image.height * scale;
        ensure(height + 18);
        page.drawImage(image, { x: cols.desc, y: y - height, width, height });
        y -= height + 18;
      }
    });
  };
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: ink });
  page.drawText("OMSCHRIJVING", { x: cols.desc, y, size: 8.5, font: bold, color: white });
  right("AANTAL", cols.qty + 40, y, 8.5, bold, white);
  right("EENHEIDSPRIJS", cols.price, y, 8.5, bold, white);
  right("BEDRAG", cols.amt, y, 8.5, bold, white);
  y -= 22;
  drawLines(mainLines);
  if (!mainLines.length && !optionLines.length) { page.drawText("Geen posten.", { x: cols.desc, y, size: 10, font, color: muted }); y -= 18; }

  ensure(90);
  y -= 10;
  const tot = (label: string, v: string, strong = false) => {
    right(label, W - M - 120, y, strong ? 11 : 10, strong ? bold : font, strong ? ink : muted);
    right(v, W - M - 8, y, strong ? 13 : 10.5, strong ? bold : font);
    y -= strong ? 22 : 16;
  };
  tot("Totaal excl. btw", money(d.net));
  tot(`Btw ${d.vatRate}%`, money(d.vat));
  page.drawLine({ start: { x: W - M - 230, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 1.5, color: orange });
  tot("Totaal incl. btw", money(d.total), true);

  if (optionLines.length) {
    const optNet = r2(optionLines.reduce((s, l) => s + l.amount, 0));
    const optVat = r2((optNet * d.vatRate) / 100);
    ensure(60);
    y -= 6;
    page.drawText("OPTIES - NIET INBEGREPEN IN HET TOTAAL", { x: M, y, size: 8.5, font: bold, color: orange });
    y -= 8;
    page.drawText(pr("De klant kan deze opties meenemen; ze worden pas aangerekend als ze gekozen worden."), { x: M, y, size: 8.5, font, color: muted });
    y -= 14;
    drawLines(optionLines);
    ensure(50);
    y -= 6;
    tot("Opties excl. btw", money(optNet));
    tot(`Btw ${d.vatRate}%`, money(optVat));
    tot("Opties incl. btw", money(r2(optNet + optVat)), true);
  }

  ensure(70);
  y -= 8;
  page.drawRectangle({ x: M, y: y - 44, width: W - 2 * M, height: 56, color: soft, borderColor: orange, borderWidth: 1.5 });
  if (bestek && !(d.signedName && d.signedAt)) {
    page.drawText(pr("Bestek opgemaakt voor de schaderegeling met de verzekeraar."), { x: M + 12, y: y - 8, size: 10.5, font: bold, color: ink });
    page.drawText(pr(`Prijzen geldig tot ${date(d.validUntil)}.${photos.length ? ` ${photos.length} foto's van de schade in bijlage.` : ""}`), { x: M + 12, y: y - 24, size: 9.5, font, color: ink });
  } else if (d.signedName && d.signedAt) {
    page.drawText(pr(`Akkoord: ondertekend door ${d.signedName} op ${new Date(d.signedAt).toLocaleString("nl-BE")}.`), { x: M + 12, y: y - 8, size: 10.5, font: bold, color: ink });
  } else {
    page.drawText(pr("Akkoord? Onderteken deze offerte via de link in de e-mail."), { x: M + 12, y: y - 8, size: 10.5, font: bold, color: ink });
    page.drawText(pr(`Deze offerte is geldig tot ${date(d.validUntil)}.`), { x: M + 12, y: y - 24, size: 9.5, font, color: ink });
  }
  y -= 64;

  // Photo annex (two per page) precedes the terms.
  for (let i = 0; i < photos.length; i++) {
    const bytes = photos[i];
    if (!bytes) continue;
    const k = photoKind(bytes);
    if (!k) throw new Error("Een foto heeft een niet-ondersteund formaat. Gebruik JPG of PNG.");
    const image = k === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    if (i % 2 === 0) {
      page = doc.addPage([W, H]); chrome(false);
      page.drawText(pr(`FOTO'S VAN DE SCHADE - ${d.number}`), { x: M, y, size: 11, font: bold, color: orange });
      y -= 20;
    }
    const scale = Math.min((W - 2 * M) / image.width, 290 / image.height, 1);
    const w = image.width * scale, h = image.height * scale;
    page.drawText(pr(`Foto ${i + 1} van ${photos.length}`), { x: M, y, size: 9, font, color: muted });
    page.drawImage(image, { x: M + (W - 2 * M - w) / 2, y: y - 12 - h, width: w, height: h });
    y -= 320;
  }

  await appendTermsPdf(doc);
  return doc.save();
}
