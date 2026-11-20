import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RIORY_LOGO_PNG_BASE64 } from "./riory-logo";
import { supplierFooterLine } from "./company-id";

export type PriceListData = {
  date: string;
  company: { name: string; vat: string };
  activities: { name: string; hourlyRate: number }[];
  products: { name: string; unit: string; price: number; description?: string | null }[];
};

const W = 595.28, H = 841.89, M = 48;
const money = (n: number) => `EUR ${n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Prijslijst in de Riory-huisstijl (zelfde kop, logo en voet als offertes); prijzen excl. btw. */
export async function createPriceListPdf(d: PriceListData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(RIORY_LOGO_PNG_BASE64);
  const ink = rgb(0.118, 0.18, 0.204), orange = rgb(0.953, 0.573, 0), muted = rgb(0.42, 0.46, 0.48), soft = rgb(0.996, 0.957, 0.902), white = rgb(1, 1, 1);
  const pr = (t: string) => [...t].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const clip = (t: string, size: number, width: number, f = font) => { const s = pr(t); if (f.widthOfTextAtSize(s, size) <= width) return s; let c = s; while (c && f.widthOfTextAtSize(`${c}...`, size) > width) c = c.slice(0, -1); return `${c}...`; };
  let page = doc.addPage([W, H]);
  let y = 0;
  const chrome = (first: boolean) => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: orange });
    const lw = first ? 160 : 100, lh = lw * (logo.height / logo.width);
    page.drawImage(logo, { x: M, y: H - 30 - lh, width: lw, height: lh });
    page.drawRectangle({ x: 0, y: 0, width: W, height: 34, color: ink });
    page.drawText(pr(supplierFooterLine(d.company)), { x: M, y: 13, size: 8, font, color: white });
    y = first ? H - 130 : H - 80;
  };
  const right = (t: string, x: number, yy: number, size: number, f = font, color = ink) => page.drawText(pr(t), { x: x - f.widthOfTextAtSize(pr(t), size), y: yy, size, font: f, color });
  const ensure = (h: number) => { if (y - h < 56) { page = doc.addPage([W, H]); chrome(false); } };
  chrome(true);
  right("PRIJSLIJST", W - M, H - 50, 22, bold);
  right(`Datum ${new Date(`${d.date}T12:00:00Z`).toLocaleDateString("nl-BE")}`, W - M, H - 68, 9.5, font, muted);
  right("Alle prijzen excl. btw", W - M, H - 81, 9.5, font, muted);

  const section = (title: string, head: [string, string, string]) => {
    ensure(60);
    page.drawText(title, { x: M, y, size: 8.5, font: bold, color: orange });
    y -= 20;
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: ink });
    page.drawText(head[0], { x: M + 8, y, size: 9, font: bold, color: white });
    right(head[1], W - M - 110, y, 9, bold, white);
    right(head[2], W - M - 8, y, 9, bold, white);
    y -= 22;
  };
  const row = (i: number, name: string, mid: string, price: string, sub?: string | null) => {
    const h = sub ? 30 : 18;
    ensure(h + 4);
    if (i % 2) page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: soft });
    page.drawText(clip(name, 10, W - 2 * M - 200, bold), { x: M + 8, y, size: 10, font: bold, color: ink });
    if (sub) page.drawText(clip(sub.replace(/\s+/g, " "), 8.5, W - 2 * M - 200), { x: M + 8, y: y - 12, size: 8.5, font, color: muted });
    right(mid, W - M - 110, y, 10, font, muted);
    right(price, W - M - 8, y, 10, bold);
    y -= h;
  };
  if (d.activities.length) {
    section("ARBEID", ["Activiteit", "Eenheid", "Prijs"]);
    d.activities.forEach((a, i) => row(i, a.name, "per uur", money(a.hourlyRate)));
    ensure(30);
    page.drawText(pr("Eerste uur volledig, daarna per begonnen kwartier."), { x: M + 8, y: y - 4, size: 8.5, font, color: muted });
    y -= 30;
  }
  if (d.products.length) {
    section("PRODUCTEN EN MATERIALEN", ["Product", "Eenheid", "Prijs"]);
    d.products.forEach((p, i) => row(i, p.name, p.unit, money(p.price), p.description?.trim() || null));
  }
  return doc.save();
}
