import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { RIORY_LOGO_PNG_BASE64 } from "./riory-logo";
import { supplierFooterLine } from "./company-id";
import { appendTermsPdf } from "./terms-pdf";
import { invoiceTaxGroups, type ContractLine } from "./contract-billing";
import { repeatLabel, type RepeatUnit } from "./recurrence";

export type ContractPdfData = {
  number?: string | null;
  name: string;
  date: string;
  startDate?: string | null;
  endDate?: string | null;
  repeatEvery: number;
  repeatUnit: RepeatUnit;
  repeatOrdinal?: number | null;
  repeatWeekday?: number | null;
  description?: string | null;
  company: { name: string; vat: string; address?: string | null; kmRate?: number | null };
  customer: { name: string; address?: string | null; vatNumber?: string | null; email?: string | null };
  lines: ContractLine[];
  fallbackAmount?: number | null;
  signedName?: string | null;
  signedAt?: string | null;
};

/** Stelt het volgende contractnummer voor op basis van bestaande nummers in hetzelfde jaar (bv. 2026/00003). */
export function nextContractNumber(existing: (string | null | undefined)[], year = new Date().getUTCFullYear()): string {
  const prefix = `${year}/`;
  let max = 0;
  for (const raw of existing) {
    if (!raw || !raw.startsWith(prefix)) continue;
    const n = Number.parseInt(raw.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

const W = 595.28, H = 841.89, M = 48;
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `EUR ${n.toLocaleString("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("nl-BE") : "—");

/** Waterdichte onderhoudsovereenkomst in Riory-huisstijl met officiële algemene voorwaarden. */
export async function createContractPdf(d: ContractPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(RIORY_LOGO_PNG_BASE64);
  const ink = rgb(0.118, 0.18, 0.204), orange = rgb(0.953, 0.573, 0), muted = rgb(0.42, 0.46, 0.48), soft = rgb(0.996, 0.957, 0.902), lineCol = rgb(0.84, 0.86, 0.87), white = rgb(1, 1, 1);
  const pr = (t: string) => [...t].map((c) => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const wrap = (t: string, size: number, width: number, f = font): string[] => {
    const out: string[] = [];
    for (const para of t.split(/\r?\n/)) {
      const words = pr(para.trim()).split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      let cur = "";
      for (const word of words) {
        const next = cur ? `${cur} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) <= width) cur = next;
        else { if (cur) out.push(cur); cur = word; }
      }
      if (cur) out.push(cur);
    }
    return out;
  };
  let page = doc.addPage([W, H]);
  let y = 0;
  const chrome = (first: boolean) => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: orange });
    const lw = first ? 150 : 95, lh = lw * (logo.height / logo.width);
    page.drawImage(logo, { x: M, y: H - 28 - lh, width: lw, height: lh });
    page.drawRectangle({ x: 0, y: 0, width: W, height: 32, color: ink });
    page.drawText(pr(supplierFooterLine(d.company)), { x: M, y: 12, size: 8, font, color: white });
    y = first ? H - 118 : H - 72;
  };
  const right = (t: string, x: number, yy: number, size: number, f = font, color = ink) => page.drawText(pr(t), { x: x - f.widthOfTextAtSize(pr(t), size), y: yy, size, font: f, color });
  const ensure = (h: number) => { if (y - h < 50) { page = doc.addPage([W, H]); chrome(false); } };
  const para = (text: string, size = 9, f = font, color = ink, gap = 6) => {
    const lines = wrap(text, size, W - 2 * M, f);
    ensure(lines.length * (size + 3.5) + gap);
    for (const l of lines) { page.drawText(l, { x: M, y, size, font: f, color }); y -= size + 3.5; }
    y -= gap;
  };
  const heading = (title: string) => {
    ensure(28);
    y -= 4;
    page.drawText(pr(title), { x: M, y, size: 10, font: bold, color: orange });
    y -= 14;
  };

  chrome(true);
  right("ONDERHOUDSOVEREENKOMST", W - M, H - 46, 17, bold);
  if (d.number) right(`Contractnummer ${d.number}`, W - M, H - 63, 9.5, bold, ink);
  right(`Opgesteld op ${fmtDate(d.date)}`, W - M, H - 77, 9, font, muted);

  const companyAddress = (d.company.address ?? "").trim() || "Natveld 47, 3740 Bilzen-Hoeselt";
  const boxW = (W - 2 * M - 12) / 2;
  const leftLines = wrap(`${d.company.name || "Riory BV"}\n${companyAddress}\nOndernemingsnr. ${d.company.vat || "BE 0840.931.404"}\nVertegenwoordigd door zaakvoerder Yordi Nijs`, 8.5, boxW - 16);
  const custParts = [d.customer.name, d.customer.address, d.customer.vatNumber ? `Ondernemingsnr. / btw: ${d.customer.vatNumber}` : null, d.customer.email ? `E-mail: ${d.customer.email}` : null].filter(Boolean).join("\n");
  const rightLines = wrap(custParts, 8.5, boxW - 16);
  const boxH = Math.max(leftLines.length, rightLines.length) * 12 + 28;
  ensure(boxH + 12);
  page.drawRectangle({ x: M, y: y - boxH, width: boxW, height: boxH, color: soft });
  page.drawRectangle({ x: M + boxW + 12, y: y - boxH, width: boxW, height: boxH, color: soft });
  page.drawText("OPDRACHTNEMER (RIORY)", { x: M + 8, y: y - 14, size: 7.5, font: bold, color: orange });
  page.drawText("DE KLANT", { x: M + boxW + 20, y: y - 14, size: 7.5, font: bold, color: orange });
  leftLines.forEach((l, i) => page.drawText(l, { x: M + 8, y: y - 28 - i * 12, size: 8.5, font: i === 0 ? bold : font, color: ink }));
  rightLines.forEach((l, i) => page.drawText(l, { x: M + boxW + 20, y: y - 28 - i * 12, size: 8.5, font: i === 0 ? bold : font, color: ink }));
  y -= boxH + 14;

  heading("Artikel 1 - Voorwerp van de overeenkomst");
  para(`Deze onderhoudsovereenkomst regelt de periodieke uitvoering van de hieronder beschreven werkzaamheden ("${d.name}") door Riory voor de Klant.`);

  const freq = repeatLabel(d.repeatEvery, d.repeatUnit, d.repeatOrdinal, d.repeatWeekday);
  heading("Artikel 2 - Te leveren diensten en frequentie");
  para(`2.1. Frequentie: ${freq}${d.startDate ? `, met eerste geplande beurt op ${fmtDate(d.startDate)}` : ""}${d.endDate ? ` tot en met ${fmtDate(d.endDate)}` : ""}.`);
  if (d.description?.trim()) para(`Bijzondere afspraken en omschrijving:\n${d.description.trim()}`, 8.5, font, ink, 8);

  const calcLines = d.lines.map((l) => ({
    ...l,
    netUnit: l.unitPrice * (1 - l.discount / 100),
    amount: r2(l.quantity * l.unitPrice * (1 - l.discount / 100)),
  }));
  if (calcLines.length > 0) {
    ensure(48);
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 19, color: ink });
    page.drawText("Omschrijving", { x: M + 6, y, size: 8.5, font: bold, color: white });
    right("Aantal", W - M - 160, y, 8.5, bold, white);
    right("Eenheidsprijs", W - M - 82, y, 8.5, bold, white);
    right("Bedrag excl.", W - M - 6, y, 8.5, bold, white);
    y -= 20;
    for (const [i, l] of calcLines.entries()) {
      const descLines = wrap(l.description + (l.discount > 0 ? ` (-${l.discount}% korting)` : ""), 8.5, W - 2 * M - 230);
      const rowH = Math.max(18, descLines.length * 11 + 8);
      ensure(rowH + 6);
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 11, width: W - 2 * M, height: rowH, color: soft });
      descLines.forEach((dl, idx) => page.drawText(dl, { x: M + 6, y: y - idx * 11, size: 8.5, font, color: ink }));
      right(`${l.quantity} ${l.unit || "st"}`, W - M - 160, y, 8.5);
      right(money(l.netUnit), W - M - 82, y, 8.5);
      right(money(l.amount), W - M - 6, y, 8.5, bold);
      y -= rowH;
    }
    const net = r2(calcLines.reduce((s, l) => s + l.amount, 0));
    const groups = invoiceTaxGroups(calcLines.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.netUnit, amount: l.amount, vatRate: l.vatRate })), 21);
    const vat = r2(groups.reduce((s, g) => s + g.vat, 0));
    ensure(46);
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.7, color: lineCol });
    y -= 6;
    right(`Totaal per beurt excl. btw:  ${money(net)}`, W - M - 6, y, 9, bold);
    y -= 13;
    for (const g of groups) { right(`Btw ${g.rate}%:  ${money(g.vat)}`, W - M - 6, y, 8.5, font, muted); y -= 12; }
    right(`Totaal per beurt incl. btw:  ${money(r2(net + vat))}`, W - M - 6, y, 9.5, bold, orange);
    y -= 14;
  } else if (d.fallbackAmount != null) {
    para(`Overeengekomen bedrag per beurt: ${money(Number(d.fallbackAmount))} excl. btw.`, 9, bold);
  }

  const kmText = d.company.kmRate && d.company.kmRate > 0 ? ` en verplaatsingskosten (${money(d.company.kmRate)}/km heen en terug)` : "";
  para(`2.2. Planning: de concrete uitvoeringsdatum wordt in onderling overleg vastgelegd volgens de beschikbaarheid van Riory.`);
  para(`2.3. Meerwerken: werkzaamheden die buiten dit onderhoudscontract vallen worden afzonderlijk aangerekend tegen de geldende regietarieven (zie Bijlage 1 bij de algemene voorwaarden).`);
  para(`2.4. Toegang: de Klant garandeert vrije en veilige toegang tot de installaties en werkzone. Indien de werken niet kunnen doorgaan door gebrek aan toegang, wordt de verloren tijd aangerekend tegen regietarief${kmText}.`);

  heading("Artikel 3 - Prijs, facturatie en indexatie");
  para("3.1. Alle vermelde prijzen zijn uitgedrukt in euro en exclusief btw. Facturatie gebeurt na elke uitgevoerde onderhoudsbeurt. Facturen zijn betaalbaar binnen vijftien (15) kalenderdagen na factuurdatum. Bij laattijdige betaling gelden de verwijlintresten en het schadebeding uit de bijgevoegde Algemene Voorwaarden (B2B conform de Wet Betalingsachterstand; B2C conform Boek XIX WER met kosteloze eerste herinnering).");
  para("3.2. De overeengekomen prijs blijft gedurende de eerste drie (3) jaren vast en wordt daarna jaarlijks op de verjaardag van de overeenkomst geindexeerd volgens de Belgische gezondheidsindex (voor maximaal 80% van de prijs gekoppeld aan de loon- en werkingskosten conform art. 57 van de Wet van 30 maart 1976).");

  heading("Artikel 4 - Duur, opzegging en opzegvergoeding");
  para(d.endDate
    ? `4.1. Deze overeenkomst wordt gesloten voor bepaalde duur tot en met ${fmtDate(d.endDate)} en kan voordien enkel schriftelijk in onderling overleg of wegens ernstige tekortkoming worden beeindigd.`
    : "4.1. Deze overeenkomst wordt gesloten voor onbepaalde duur met ingang vanaf ondertekening. Beide partijen kunnen opzeggen per aangetekend schrijven of e-mail met een opzegtermijn van minstens drie (3) maanden voor de jaarlijkse verjaardag (voor consumenten B2C geldt een opzegtermijn van maximaal twee (2) maanden conform art. VI.91 WER).");
  para("4.2. Opzeg- en verbrekingsvergoeding: bij vroegtijdige eenzijdige verbreking of opzegging zonder naleving van de overeengekomen opzegtermijn is de Klant (B2B) een forfaitaire opzegvergoeding verschuldigd gelijk aan 30% van de resterende geplande beurten tot de eerstvolgende opzegbare vervaldag (met een minimum van een onderhoudsbeurt), onverminderd het recht van Riory om hogere bewezen schade te vorderen. Voor consumenten (B2C) geldt dit beding wederkerig en beperkt tot de wettelijk toegelaten vergoeding. Reeds uitgevoerde of voor de opzegging ingeplande beurten blijven steeds volledig verschuldigd.");
  para("4.3. Herroepingsrecht (B2C op afstand): indien de Klant een consument is en deze overeenkomst op afstand ondertekent, beschikt hij over een herroepingsrecht van veertien (14) kalenderdagen vanaf ondertekening (Boek VI WER), tenzij hij uitdrukkelijk verzoekt de uitvoering binnen deze termijn te starten.");

  heading("Artikel 5 - Algemene voorwaarden en nietigheid");
  para("5.1. De bijgevoegde Algemene Voorwaarden van Riory BV (inclusief Bijlage 1 Tarieven) maken integraal deel uit van deze overeenkomst. Door ondertekening bevestigt de Klant hiervan kennis te hebben genomen en deze te aanvaarden. Eventuele nietigheid van een bepaling tast de geldigheid van de overige bepalingen niet aan.");

  heading("Artikel 6 - Toepasselijk recht en bevoegde rechtbank");
  para("6.1. Uitsluitend het Belgisch recht is van toepassing. Geschillen vallen onder de bevoegdheid van de rechtbanken van het arrondissement Limburg (B2B) of de wettelijk bevoegde rechter (B2C).");

  ensure(92);
  y -= 8;
  para(`Opgesteld te Bilzen-Hoeselt op ${fmtDate(d.date)} in zoveel originele exemplaren als er partijen zijn, waarvan elke partij erkent een exemplaar te hebben ontvangen.`, 8.5, font, muted, 12);
  const sigW = (W - 2 * M - 24) / 2;
  page.drawText("Voor akkoord Riory BV (Yordi Nijs)", { x: M, y, size: 8.5, font: bold, color: ink });
  page.drawText("Voor akkoord de Klant (gelezen en goedgekeurd)", { x: M + sigW + 24, y, size: 8.5, font: bold, color: ink });
  if (d.signedName) {
    page.drawText(pr(`Digitaal ondertekend door ${d.signedName}${d.signedAt ? ` op ${fmtDate(d.signedAt)}` : ""}`), { x: M + sigW + 24, y: y - 16, size: 8, font, color: orange });
  }
  y -= 42;
  page.drawLine({ start: { x: M, y }, end: { x: M + sigW, y }, thickness: 0.7, color: ink });
  page.drawLine({ start: { x: M + sigW + 24, y }, end: { x: W - M, y }, thickness: 0.7, color: ink });

  await appendTermsPdf(doc);
  return doc.save();
}