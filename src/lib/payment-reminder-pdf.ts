import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { RIORY_LOGO_PNG_BASE64 } from './riory-logo';
import { appendTermsPdf } from './terms-pdf';
import type { ReminderDocument } from './payment-reminders';

export async function createReminderPdf(d: ReminderDocument) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(RIORY_LOGO_PNG_BASE64);
  const ink = rgb(.118, .18, .204), orange = rgb(.953, .573, 0);
  const safe = (s: string) => [...s].map(c => { try { font.encodeText(c); return c; } catch { return '?'; } }).join('');
  let page = pdf.addPage([595.28, 841.89]);
  let y = 715;
  const chrome = () => {
    page.drawRectangle({ x: 0, y: 835.89, width: 595.28, height: 6, color: orange });
    page.drawImage(logo, { x: 48, y: 765, width: 125, height: 125 * logo.height / logo.width });
    page.drawText(safe(`Riory | ${d.number} | ${d.date}`), { x: 48, y: 32, size: 9, font, color: ink });
  };
  const line = (s: string, strong = false, size = 10) => {
    if (y < 65) { page = pdf.addPage([595.28, 841.89]); y = 715; chrome(); }
    page.drawText(safe(s), { x: 48, y, size, font: strong ? bold : font, color: ink }); y -= 15;
  };
  chrome();
  // Separate lines keep the formal title inside the page width.
  line(d.stage === 3 ? 'INGEBREKESTELLING' : `${d.stage === 1 ? 'EERSTE' : 'TWEEDE'} BETALINGSHERINNERING`, true, 16);
  if (d.stage === 3) line('Laatste aanmaning', true, 12);
  line(`Factuur ${d.number} | ${d.date}`);
  y -= 10;
  for (const text of [d.customer.name, d.customer.street ? `${d.customer.street} ${d.customer.houseNumber ?? ''}` : d.customer.address ?? '', [d.customer.postalCode, d.customer.city].filter(Boolean).join(' '), d.recipient]) {
    if (text) line(text);
  }
  y -= 10;
  for (const paragraph of d.body.split('\n')) {
    let current = '';
    for (const word of safe(paragraph).split(' ')) {
      if (font.widthOfTextAtSize(`${current} ${word}`, 10) > 499 && current) { line(current); current = ''; }
      current = current ? `${current} ${word}` : word;
    }
    line(current, paragraph.startsWith('Totaal te betalen:'));
  }
  await appendTermsPdf(pdf);
  return pdf.save();
}