import { appendTermsPdf } from "./terms-pdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RIORY_LOGO_PNG_BASE64 } from "./riory-logo";
import { groupInvoiceLines, type InvoiceCustomer, type InvoiceLine } from "./invoice";
import { invoiceTaxGroups } from './contract-billing';
import { invoiceVatNotices } from './invoice-vat-notices';
import { invoicePaymentReference } from './invoice-payment-reference';
import { buildSepaQr } from './sepa-qr';
import { splitLineText } from './line-text';
import QRCode from 'qrcode';

export type InvoicePdfData = {
  number: string; issueDate: string; dueDate: string; workOrderNumber: number;
  customer: InvoiceCustomer; lines: InvoiceLine[]; vatRate: number; net: number; vat: number; total: number; paidAmount: number;
  company: { name: string; vat: string; iban: string | null; bic: string | null }; terms: string | null;
  /** Document title, defaults to FACTUUR; credit notes pass CREDITNOTA. */
  title?: string;
  /** Reference line under the customer block, defaults to the work order number. */
  reference?: string;
  /** Free explanation written by the admin, shown under the totals. */
  note?: string | null;
};

const W = 595.28, H = 841.89, M = 48;
const money = (n: number) => `EUR ${n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-BE");

/** Worker-compatible invoice PDF in the riory.be style, with the general terms appended on their own pages. */
export async function createInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(RIORY_LOGO_PNG_BASE64);
  const ink = rgb(0.118, 0.18, 0.204), orange = rgb(0.953, 0.573, 0), muted = rgb(0.42, 0.46, 0.48), soft = rgb(0.996, 0.957, 0.902), white = rgb(1, 1, 1), annex = rgb(0.945, 0.78, 0.55);
  const pr = (t: string) => [...t].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const wrap = (text: string, size: number, width: number, f = font) => {
    const out: string[] = [];
    for (const block of pr(text).split(/\r?\n/)) {
      let cur = "";
      for (const w of block.split(" ")) { const t = cur ? `${cur} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w; } else cur = t; }
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

  right(d.title ?? "FACTUUR", W - M, H - 50, 22, bold);
  right(d.number, W - M, H - 68, 14, bold, orange);
  right(`Factuurdatum ${date(d.issueDate)}`, W - M, H - 84, 9.5, font, muted);
  right(`Vervaldatum ${date(d.dueDate)}`, W - M, H - 97, 9.5, font, muted);

  // Customer block
  page.drawText("FACTUUR AAN", { x: M, y, size: 8.5, font: bold, color: muted });
  y -= 15;
  const c = d.customer;
  const cust = [c.name, c.street ? `${c.street} ${c.houseNumber ?? ""}`.trim() : c.address ?? "", [c.postalCode, c.city].filter(Boolean).join(" "), c.vatNumber ? `Btw ${c.vatNumber}` : ""].filter(Boolean);
  cust.forEach((l, i) => page.drawText(pr(l), { x: M, y: y - i * 14, size: i === 0 ? 11.5 : 10.5, font: i === 0 ? bold : font, color: ink }));
  y -= cust.length * 14 + 6;
  if (c.siteAddress) { page.drawText(pr(`Werfadres: ${c.siteAddress}`), { x: M, y, size: 9.5, font, color: muted }); y -= 14; }
  page.drawText(pr(d.reference ?? `Betreft werkbon #${d.workOrderNumber}`), { x: M, y, size: 9.5, font, color: muted });
  y -= 28;

  // Lines table
  const cols = { desc: M + 8, qty: W - M - 250, price: W - M - 100, amt: W - M - 8 };
  page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: ink });
  page.drawText("OMSCHRIJVING", { x: cols.desc, y, size: 8.5, font: bold, color: white });
  right("AANTAL", cols.qty + 40, y, 8.5, bold, white);
  right("EENHEIDSPRIJS", cols.price, y, 8.5, bold, white);
  right("BEDRAG", cols.amt, y, 8.5, bold, white);
  y -= 22;
  let row = 0;
  for (const sec of groupInvoiceLines(d.lines)) {
    if (sec.title) {
      const ts = wrap(sec.title, 10.5, cols.qty - cols.desc - 20, bold);
      const th = ts.length * 14 + 8;
      ensure(th);
      ts.forEach((t, j) => page.drawText(t, { x: cols.desc, y: y - j * 14, size: 10.5, font: bold, color: ink }));
      right(money(sec.subtotal), cols.amt, y, 10.5, bold);
      y -= th;
    }
    for (const l of sec.lines) {
      const indent = sec.title ? 12 : 0;
      const x = cols.desc + indent;
      const w = cols.qty - cols.desc - 20 - indent;
      const { title, detail } = splitLineText(l.description);
      const meta = [l.vatRate !== undefined ? `btw ${l.vatRate}%` : "", l.discount ? `korting ${l.discount}%` : ""].filter(Boolean).join(" · ");
      const tl = wrap(title, 10.5, w, bold);
      const dl = detail ? wrap(detail, 9, w - 14) : [];
      const lastTitle = tl[tl.length - 1] ?? "";
      const metaInline = !!meta && bold.widthOfTextAtSize(lastTitle, 10.5) + 8 + font.widthOfTextAtSize(pr(meta), 8.5) <= w;
      const h = tl.length * 14 + (meta && !metaInline ? 11 : 0) + (dl.length ? 5 + dl.length * 11.5 : 0) + 10;
      ensure(h);
      if (row++ % 2 === 0) page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: soft });
      tl.forEach((t, j) => page.drawText(t, { x, y: y - j * 14, size: 10.5, font: bold, color: ink }));
      let ty = y - tl.length * 14;
      if (meta && metaInline) page.drawText(pr(meta), { x: x + bold.widthOfTextAtSize(lastTitle, 10.5) + 8, y: y - (tl.length - 1) * 14, size: 8.5, font, color: muted });
      else if (meta) { page.drawText(pr(meta), { x, y: ty - 1, size: 8.5, font, color: muted }); ty -= 11; }
      if (dl.length) {
        const top = ty - 5;
        page.drawRectangle({ x: x + 2, y: top - dl.length * 11.5 + 3, width: 2, height: dl.length * 11.5, color: annex, opacity: 0.6 });
        dl.forEach((t, j) => page.drawText(t, { x: x + 12, y: top - j * 11.5, size: 9, font, color: muted }));
      }
      right(`${l.quantity.toLocaleString("nl-BE")} ${l.unit}`, cols.qty + 40, y, 10);
      if (!sec.hidePrice) { right(money(l.originalUnitPrice ?? l.unitPrice), cols.price, y, 10); right(money(l.amount), cols.amt, y, 10); }
      y -= h;
    }
  }
  if (!d.lines.length) { page.drawText("Geen aanrekenbare posten.", { x: cols.desc, y, size: 10, font, color: muted }); y -= 18; }

  // Totals
  ensure(110);
  y -= 10;
  const tot = (label: string, v: string, strong = false) => {
    right(label, W - M - 120, y, strong ? 11 : 10, strong ? bold : font, strong ? ink : muted);
    right(v, W - M - 8, y, strong ? 13 : 10.5, strong ? bold : font);
    y -= strong ? 22 : 16;
  };
  tot("Totaal excl. btw", money(d.net));
  if (d.lines.some(l=>l.vatRate !== undefined)) {
    for (const g of invoiceTaxGroups(d.lines,d.vatRate)) { ensure(20); tot(`Btw ${g.rate}%`,money(g.vat)); }
  } else tot(`Btw ${d.vatRate}%`, money(d.vat));
  page.drawLine({ start: { x: W - M - 230, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 1.5, color: orange });
  tot("Totaal incl. btw", money(d.total), true);
  if (d.note?.trim()) {
    const nl = wrap(d.note.trim(), 9.5, W - 2 * M);
    ensure(24 + nl.length * 13);
    y -= 8;
    page.drawText("UITLEG", { x: M, y, size: 9.5, font: bold, color: ink });
    y -= 15;
    for (const line of nl) { ensure(13); page.drawText(line, { x: M, y, size: 9.5, font, color: ink }); y -= 13; }
    y -= 6;
  }
  for (const notice of invoiceVatNotices(d)) {
    const lines = wrap(notice.text, 9, W - 2 * M);
    ensure(24 + lines.length * 12);
    y -= 8;
    page.drawText(pr(notice.title), { x: M, y, size: 9.5, font: bold, color: ink });
    y -= 15;
    for (const line of lines) { ensure(12); page.drawText(line, { x: M, y, size: 9, font, color: ink }); y -= 12; }
    y -= 6;
  }

  // Payment box
  const open = Math.max(0, Math.round((d.total - d.paidAmount) * 100) / 100);
  const paymentReference = invoicePaymentReference(d.number);
  const qr = d.total > 0 && open > 0.005 && d.company.iban
    ? await doc.embedPng(await QRCode.toDataURL(buildSepaQr({ serviceName: d.company.name, iban: d.company.iban, bic: d.company.bic, amount: open, reference: d.number }), { width: 320, margin: 4, errorCorrectionLevel: 'M' }))
    : null;
  const boxHeight = qr ? 120 : 82;
  ensure(boxHeight + 20);
  y -= 8;
  page.drawRectangle({ x: M, y: y - boxHeight + 12, width: W - 2 * M, height: boxHeight, color: soft, borderColor: orange, borderWidth: 1.5 });
  if (qr) page.drawImage(qr, { x: W - M - 112, y: y - 96, width: 104, height: 104 });
  if (d.total < 0) {
    page.drawText(pr(`Terugbetaling aan de klant: ${money(-d.total)}.`), { x: M + 12, y: y - 8, size: 10.5, font: bold, color: ink });
  } else if (open <= 0.005) {
    page.drawText(pr(`Reeds betaald: ${money(d.paidAmount)}. Niets meer te betalen.`), { x: M + 12, y: y - 8, size: 10.5, font: bold, color: ink });
  } else {
    page.drawText(pr(`Te betalen: ${money(open)} vóór ${date(d.dueDate)}`), { x: M + 12, y: y - 6, size: 11, font: bold, color: ink });
    const paymentLines = [d.company.iban ? `IBAN ${d.company.iban}` : '', d.company.bic ? `BIC ${d.company.bic}` : '', `Mededeling: ${paymentReference}`, d.paidAmount > 0 ? `Reeds betaald ${money(d.paidAmount)}` : ''].filter(Boolean);
    paymentLines.forEach((text, index) => page.drawText(pr(text), { x: M + 12, y: y - 24 - index * 14, size: 9.5, font, color: ink }));
  }
  if (open <= 0.005 || d.total < 0) page.drawText(pr(`Mededeling: ${paymentReference}`), { x: M + 12, y: y - 30, size: 9.5, font, color: ink });
  y -= boxHeight + 8;

  await appendTermsPdf(doc);
  return doc.save();
}
