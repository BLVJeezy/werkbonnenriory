// Parser voor Belgische CODA-bankuittreksels (febelfin CODA 2.x, vaste breedte).
// Enkel bewegingsrecords (21), tegenpartij (23) en mededeling (31) worden gebruikt;
// saldo- en identificatierecords worden genegeerd.

export interface CodaTransaction {
  tx_date: string; // ISO yyyy-mm-dd (boekingsdatum)
  amount: number; // positief = bijschrijving
  counterparty: string | null;
  description: string | null;
  reference: string | null; // bankreferentie, handig voor dedupe
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// DDMMYY -> ISO; jaren < 50 = 20xx, anders 19xx (CODA-conventie).
const toIsoDate = (ddmmyy: string): string | null => {
  if (!/^\d{6}$/.test(ddmmyy)) return null;
  const dd = ddmmyy.slice(0, 2), mm = ddmmyy.slice(2, 4), yy = Number(ddmmyy.slice(4, 6));
  const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
  const d = new Date(Date.UTC(yyyy, Number(mm) - 1, Number(dd)));
  return d.getUTCFullYear() === yyyy && d.getUTCMonth() === Number(mm) - 1 && d.getUTCDate() === Number(dd)
    ? `${yyyy}-${mm}-${dd}`
    : null;
};

export function parseCoda(text: string): CodaTransaction[] {
  const out: CodaTransaction[] = [];
  let current: CodaTransaction | null = null;
  let info = "";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (line.length < 2) continue;
    const type = line.slice(0, 2);

    if (type === "21") {
      // Bewegingsrecord, artikel 1.
      const amountRaw = line.slice(31, 46); // posities 32-46: teken + 14 cijfers
      const cents = Number(amountRaw.slice(1));
      if (!/^[01]\d{14}$/.test(amountRaw) || Number.isNaN(cents)) { current = null; continue; }
      const sign = amountRaw[0] === "0" ? 1 : -1; // 0 = bijschrijving, 1 = afboeking
      const booking = toIsoDate(line.slice(115, 121)) ?? toIsoDate(line.slice(46, 52)); // boekingsdatum, anders valutadatum
      if (!booking) { current = null; continue; }
      current = {
        tx_date: booking,
        amount: Math.round(sign * cents) / 100,
        counterparty: null,
        description: null,
        reference: clean(line.slice(10, 31)) || null,
      };
      info = "";
      out.push(current);
    } else if (type === "23" && current) {
      // Tegenpartij: rekening (10-45), naam (47-82), adres (82-124).
      const name = clean(line.slice(47, 82));
      if (name) current.counterparty = name;
      const account = clean(line.slice(10, 45));
      if (account && !current.description) current.description = account;
    } else if (type === "31" && current) {
      // Informatierecord: mededeling vanaf positie 40.
      const part = clean(line.slice(40));
      if (part) info = info ? `${info} ${part}` : part;
      if (info) current.description = info;
    } else if (type === "32" && current && !current.counterparty) {
      // Gestructureerde mededeling tegenpartijnaam (artikel 2): naam op 10-44.
      const name = clean(line.slice(10, 44));
      if (name) current.counterparty = name;
    }
  }
  return out;
}
