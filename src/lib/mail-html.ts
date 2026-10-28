import rioryLogo from '@/assets/riory-mail-logo.png.asset.json';

/** Riory-huisstijl voor klantmails: zelfde kleuren als de pdf's (oranje balk, donkere inkt, zachte achtergrond). */
const LOGO_URL = new URL(rioryLogo.url, 'https://werkbonnenriory.lovable.app').href;
const ORANGE = '#f39200';
const INK = '#1e2e34';
const MUTED = '#6b757a';
const SOFT = '#fef4e6';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const URL_RE = /^https?:\/\/\S+$/;

function button(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr><td style="background:${ORANGE};border-radius:6px"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px">${esc(label)}</a></td></tr></table>`;
}

/** Zet een platte tekstmail om naar HTML in Riory-huisstijl. Regels die enkel een link zijn worden een knop. */
export function brandedMailHtml(text: string, contactEmail = 'info@riory.be') {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (URL_RE.test(line)) {
      const prev = parts.at(-1) ?? '';
      const label = /Document openen/i.test(prev) ? 'Document openen' : /afspraak/i.test(line) ? 'Afspraak kiezen' : /offerte/i.test(line) ? 'Offerte ondertekenen' : 'Openen';
      if (/Document openen:?<\/p>$/.test(prev)) parts.pop();
      parts.push(button(line, label));
      continue;
    }
    if (!line) { parts.push('<div style="height:10px"></div>'); continue; }
    const muted = /tijdstip geregistreerd/i.test(line);
    parts.push(`<p style="margin:0;line-height:1.55;font-size:${muted ? 12 : 15}px;color:${muted ? MUTED : INK}">${esc(line).replace(/(https?:\/\/\S+)/g, (u) => `<a href="${u}" style="color:${ORANGE}">${u}</a>`)}</p>`);
  }
  return `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};padding:24px 0;font-family:Arial,Helvetica,sans-serif"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:${ORANGE};height:6px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 6px"><img src="${LOGO_URL}" alt="Riory" width="240" height="49" style="display:block;width:240px;max-width:100%;height:auto;border:0;color:${INK};font-size:26px;font-weight:800"></td></tr>
<tr><td style="padding:14px 28px 24px">${parts.join('\n')}</td></tr>
<tr><td style="background:${INK};padding:16px 28px;color:#ffffff;font-size:12px;line-height:1.6">Riory bv · Natveld 47, 3740 Bilzen · BTW BE 0840.931.404<br><a href="https://www.riory.be" style="color:${ORANGE};text-decoration:none">www.riory.be</a> · <a href="mailto:${esc(contactEmail)}" style="color:${ORANGE};text-decoration:none">${esc(contactEmail)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** Outlook-body in huisstijl. */
export const brandedBody = (text: string, contactEmail?: string) => ({ contentType: 'HTML' as const, content: brandedMailHtml(text, contactEmail) });
