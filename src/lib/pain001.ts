export type Payment = {
  creditorName: string;
  creditorIban: string;
  amount: number;
  remittance: string | null;
  executionDate: string; // YYYY-MM-DD (vervaldag)
  endToEndId: string;
};

export type Debtor = { name: string; iban: string; bic: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const iban = (s: string) => s.replace(/\s/g, "").toUpperCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Belgian structured communication (OGM): +++AAA/BBBB/CCCXX+++ with mod-97 check. */
export function isValidOgm(ref: string): boolean {
  const m = /^\+{3}(\d{3})\/(\d{4})\/(\d{5})\+{3}$/.exec(ref.trim());
  if (!m) return false;
  const base = Number(`${m[1]}${m[2]}${m[3]!.slice(0, 3)}`);
  return base % 97 === Number(m[3]!.slice(3)) || (base % 97 === 0 && Number(m[3]!.slice(3)) === 97);
}

/**
 * Pure: builds a SEPA credit transfer file (pain.001.001.03) accepted by Belgian banks.
 * Payments are grouped per execution date so each invoice is paid on its own due date.
 */
export function buildPain001(debtor: Debtor, payments: Payment[], messageId: string): string {
  if (!payments.length) throw new Error("Geen betalingen");
  const byDate = new Map<string, Payment[]>();
  for (const p of payments) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.executionDate)) throw new Error(`Ongeldige vervaldag voor ${p.creditorName}`);
    if (p.amount <= 0) throw new Error(`Ongeldig bedrag voor ${p.creditorName}`);
    byDate.set(p.executionDate, [...(byDate.get(p.executionDate) ?? []), p]);
  }
  const total = r2(payments.reduce((s, p) => s + p.amount, 0));
  const now = new Date().toISOString();
  const blocks = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ps], i) => {
    const sum = r2(ps.reduce((s, p) => s + p.amount, 0));
    const txs = ps.map((p) => {
      const ref = p.remittance?.trim();
      const rmt = ref && isValidOgm(ref)
        ? `<RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry></Tp><Ref>${esc(ref)}</Ref></CdtrRefInf></Strd></RmtInf>`
        : ref ? `<RmtInf><Ustrd>${esc(ref.slice(0, 140))}</Ustrd></RmtInf>` : "";
      return `    <CdtTrfTxInf><PmtId><EndToEndId>${esc(p.endToEndId.slice(0, 35))}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${p.amount.toFixed(2)}</InstdAmt></Amt><Cdtr><Nm>${esc(p.creditorName.slice(0, 70))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${esc(iban(p.creditorIban))}</IBAN></Id></CdtrAcct>${rmt}</CdtTrfTxInf>`;
    }).join("\n");
    return `  <PmtInf><PmtInfId>${esc(messageId)}-${i + 1}</PmtInfId><PmtMtd>TRF</PmtMtd><NbOfTxs>${ps.length}</NbOfTxs><CtrlSum>${sum.toFixed(2)}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${date}</ReqdExctnDt><Dbtr><Nm>${esc(debtor.name)}</Nm></Dbtr><DbtrAcct><Id><IBAN>${esc(iban(debtor.iban))}</IBAN></Id></DbtrAcct>${debtor.bic ? `<DbtrAgt><FinInstnId><BIC>${esc(debtor.bic)}</BIC></FinInstnId></DbtrAgt>` : ""}<ChrgBr>SLEV</ChrgBr>\n${txs}\n  </PmtInf>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n <CstmrCdtTrfInitn>\n  <GrpHdr><MsgId>${esc(messageId)}</MsgId><CreDtTm>${now}</CreDtTm><NbOfTxs>${payments.length}</NbOfTxs><CtrlSum>${total.toFixed(2)}</CtrlSum><InitgPty><Nm>${esc(debtor.name)}</Nm></InitgPty></GrpHdr>\n${blocks}\n </CstmrCdtTrfInitn>\n</Document>`;
}
