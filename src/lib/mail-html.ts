import rioryLogo from '@/assets/riory-mail-logo.png.asset.json';

/** Riory-huisstijl voor klantmails: zelfde kleuren als de pdf's (oranje balk, donkere inkt, zachte achtergrond). */
const LOGO_URL = new URL(rioryLogo.url, 'https://werkbonnenriory.lovable.app').href;
const ORANGE = '#f39200';
const INK = '#1e2e34';
const MUTED = '#6b757a';
const SOFT = '#fef4e6';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const URL_RE = /^https?:\/\/\S+$/;

function button(url: string, label: string, secondary = false) {
  if (secondary) return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px"><tr><td style="border:1px solid ${INK};border-radius:6px"><a href="${esc(url)}" style="display:inline-block;padding:9px 18px;color:${INK};font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px">${esc(label)}</a></td></tr></table>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 18px"><tr><td align="center" style="background:${ORANGE};border-radius:8px"><a href="${esc(url)}" style="display:block;padding:16px 22px;color:#ffffff;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:17px;text-align:center">${esc(label)} &rarr;</a></td></tr></table>`;
}

/** Zet een platte tekstmail om naar HTML in Riory-huisstijl. Regels die enkel een link zijn worden een knop. */
export function brandedMailHtml(text: string, contactEmail = 'info@riory.be', imageUrl?: string | null) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (URL_RE.test(line)) {
      const prev = parts.at(-1) ?? '';
      const label = /Document openen/i.test(prev) ? 'Document openen' : /afspraak/i.test(line) ? 'Afspraak kiezen' : /offerte/i.test(line) ? 'Offerte ondertekenen' : 'Openen';
      if (/Document openen:?<\/p>$/.test(prev)) parts.pop();
      parts.push(button(line, label, label === 'Document openen'));
      continue;
    }
    if (line.startsWith('! ')) {
      parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0"><tr><td style="background:${SOFT};border-left:4px solid ${ORANGE};border-radius:4px;padding:12px 14px;font-size:14px;line-height:1.5;color:${INK}"><strong>Let op:</strong> ${esc(line.slice(2))}</td></tr></table>`);
      continue;
    }
    if (line.startsWith('✓ ')) {
      parts.push(`<p style="margin:0 0 4px;line-height:1.5;font-size:14px;color:${INK}"><span style="color:${ORANGE};font-weight:700">&#10003;</span>&nbsp; ${esc(line.slice(2))}</p>`);
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
${imageUrl ? `<tr><td style="padding:10px 28px 0"><img src="${esc(imageUrl)}" alt="" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:6px"></td></tr>` : ''}
<tr><td style="padding:14px 28px 24px">${parts.join('\n')}</td></tr>
<tr><td style="background:${INK};padding:16px 28px;color:#ffffff;font-size:12px;line-height:1.6">Riory bv · Natveld 47, 3740 Bilzen · BTW BE 0840.931.404<br><a href="https://www.riory.be" style="color:${ORANGE};text-decoration:none">www.riory.be</a> · <a href="mailto:${esc(contactEmail)}" style="color:${ORANGE};text-decoration:none">${esc(contactEmail)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** Outlook-body in huisstijl. */
export const brandedBody = (text: string, contactEmail?: string) => ({ contentType: 'HTML' as const, content: brandedMailHtml(text, contactEmail) });
