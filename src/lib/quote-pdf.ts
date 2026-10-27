import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RIORY_LOGO_PNG_BASE64 } from "./riory-logo";
import type { InvoiceCustomer, InvoiceLine } from "./invoice";

export type QuotePdfData = {
  number: string; issueDate: string; validUntil: string;
  customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; net: number; vat: number; total: number;
  company: { name: string; vat: string; iban: string | null; bic: string | null }; terms: string | null;
  signedName?: string | null; signedAt?: string | null; intro?: string | null;
};

const W = 595.28, H = 841.89, M = 48;
const money = (n: number) => `EUR ${n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-BE");

/** Worker-compatible quote PDF in the riory.be style, with the general terms appended on their own pages. */
export async function createQuotePdf(d: QuotePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(RIORY_LOGO_PNG_BASE64);
  const ink = rgb(0.118, 0.18, 0.204), orange = rgb(0.953, 0.573, 0), muted = rgb(0.42, 0.46, 0.48), soft = rgb(0.996, 0.957, 0.902), white = rgb(1, 1, 1);
  const pr = (t: string) => [...t].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const wrap = (text: string, size: number, width: number) => {
    const out: string[] = [];
    for (const block of pr(text).split(/\r?\n/)) {
      let cur = "";
      for (const w of block.split(" ")) { const t = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t; }
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

  right("OFFERTE", W - M, H - 50, 22, bold);
  right(d.number, W - M, H - 68, 14, bold, orange);
  right(`Datum ${date(d.issueDate)}`, W - M, H - 84, 9.5, font, muted);
  right(`Geldig tot ${date(d.validUntil)}`, W - M, H - 97, 9.5, font, muted);

  // Customer block on a soft orange panel
  const c = d.customer;
  const cust = [c.name, c.street ? `${c.street} ${c.houseNumber ?? ""}`.trim() : c.address ?? "", [c.postalCode, c.city].filter(Boolean).join(" "), c.vatNumber ? `Btw ${c.vatNumber}` : ""].filter(Boolean);
  const panelH = cust.length * 14 + (c.siteAddress ? 14 : 0) + 26;
  page.drawRectangle({ x: M, y: y - panelH + 10, width: W - 2 * M, height: panelH, color: soft });
  page.drawRectangle({ x: M, y: y - panelH + 10, width: 4, height: panelH, color: orange });
  page.drawText("OFFERTE VOOR", { x: M + 14, y: y - 4, size: 8.5, font: bold, color: muted });
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

  const cols = { desc: M + 8, qty: W - M - 250, price: W - M - 100, amt: W - M - 8 };
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: ink });
  page.drawText("OMSCHRIJVING", { x: cols.desc, y, size: 8.5, font: bold, color: white });
  right("AANTAL", cols.qty + 40, y, 8.5, bold, white);
  right("EENHEIDSPRIJS", cols.price, y, 8.5, bold, white);
  right("BEDRAG", cols.amt, y, 8.5, bold, white);
  y -= 22;
  d.lines.forEach((l, i) => {
    const ls = wrap(l.description, 10, cols.qty - cols.desc - 20);
    const h = ls.length * 13 + 8;
    ensure(h);
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: soft });
    ls.forEach((t, j) => page.drawText(t, { x: cols.desc, y: y - j * 13, size: 10, font, color: ink }));
    right(`${l.quantity.toLocaleString("nl-BE")} ${l.unit}`, cols.qty + 40, y, 10);
    right(money(l.unitPrice), cols.price, y, 10);
    right(money(l.amount), cols.amt, y, 10);
    y -= h;
  });
  if (!d.lines.length) { page.drawText("Geen posten.", { x: cols.desc, y, size: 10, font, color: muted }); y -= 18; }

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

  ensure(70);
  y -= 8;
  page.drawRectangle({ x: M, y: y - 44, width: W - 2 * M, height: 56, color: soft, borderColor: orange, borderWidth: 1.5 });
  if (d.signedName && d.signedAt) {
    page.drawText(pr(`Akkoord: ondertekend door ${d.signedName} op ${new Date(d.signedAt).toLocaleString("nl-BE")}.`), { x: M + 12, y: y - 8, size: 10.5, font: bold, color: ink });
  } else {
    page.drawText(pr("Akkoord? Onderteken deze offerte via de link in de e-mail."), { x: M + 12, y: y - 8, size: 10.5, font: bold, color: ink });
    page.drawText(pr(`Deze offerte is geldig tot ${date(d.validUntil)}.`), { x: M + 12, y: y - 24, size: 9.5, font, color: ink });
  }
  y -= 64;

  if (d.terms?.trim()) {
    page = doc.addPage([W, H]);
    chrome(false);
    page.drawText("ALGEMENE VOORWAARDEN", { x: M, y, size: 12, font: bold, color: ink });
    y -= 22;
    for (const l of wrap(d.terms, 8.5, W - 2 * M)) { ensure(11); page.drawText(l, { x: M, y, size: 8.5, font, color: ink }); y -= 11; }
  }
  return doc.save();
}
