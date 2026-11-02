// Pure boekhoudlogica (dubbel boekhouden, Belgisch MAR). Geen I/O — getest in boekhouding.test.ts.
import { parseAmount } from "./finance";

export type JLine = { account: string; debit: number; credit: number; vat_grid?: string | null; description?: string | null };
export type PostedLine = JLine & { entry_date: string; journal: string; source?: string | null };

/** Jaarafsluiting (jaarcijfers accountant) van een vorig jaar: telt enkel mee in periodes binnen dat jaar, zodat ze nooit mengt met de openingsbalans van het volgende jaar. */
export const CLOSING_SOURCE = "jaarafsluiting";

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const accountClass = (nr: string) => Number(nr.trim()[0]);
export const isResultAccount = (nr: string) => accountClass(nr) >= 6;

export function isBalanced(lines: JLine[]) {
  const d = r2(lines.reduce((a, l) => a + l.debit, 0));
  const c = r2(lines.reduce((a, l) => a + l.credit, 0));
  return { ok: d === c && d > 0, debit: d, credit: c, diff: r2(d - c) };
}

export type InvForPosting = {
  direction: "aankoop" | "verkoop";
  doc_type: "factuur" | "creditnota";
  lines: { account: string | null; ex_vat: number; vat: number; is_investment?: boolean; description?: string | null }[];
};

/** Btw-roosters (vereenvoudigd): aankoop 81 goederen (60), 82 diensten (61+), 83 investeringen (2x), 59 aftrekbare btw,
 *  ontvangen creditnota 85 + 63. Verkoop: rooster per tarief (01/02/03) + 54, uitgereikte creditnota 49 + 64. */
export function purchaseGrid(account: string, investment = false) {
  if (investment || accountClass(account) === 2) return "83";
  return account.startsWith("60") ? "81" : "82";
}
export function salesGrid(ex: number, vat: number) {
  if (!ex) return "03";
  const rate = Math.round((vat / ex) * 100);
  return rate <= 7 ? (rate === 0 ? "45" : "01") : rate <= 13 ? "02" : "03";
}

/** Zet een goedgekeurde factuur om in een evenwichtige boeking. Creditnota draait debet/credit om. */
export function invoiceToEntry(inv: InvForPosting, ctl: { klanten?: string; leveranciers?: string } = {}): { lines: JLine[]; error?: string } {
  const K = ctl.klanten ?? "400000", L = ctl.leveranciers ?? "440000";
  if (!inv.lines.length) return { lines: [], error: "Factuur zonder lijnen" };
  const credit = inv.doc_type === "creditnota";
  const out: JLine[] = [];
  let vatTot = 0, tot = 0;
  for (const l of inv.lines) {
    const ex = r2(Math.abs(l.ex_vat)), vat = r2(Math.abs(l.vat));
    const acc = l.account || (inv.direction === "verkoop" ? "700000" : null);
    if (!acc) return { lines: [], error: "Elke lijn heeft een grootboekrekening nodig" };
    vatTot += vat; tot += ex + vat;
    if (inv.direction === "aankoop") {
      const grid = credit ? "85" : purchaseGrid(acc, l.is_investment);
      out.push({ account: acc, debit: credit ? 0 : ex, credit: credit ? ex : 0, vat_grid: grid, description: l.description ?? null });
    } else {
      const grid = credit ? "49" : salesGrid(ex, vat);
      out.push({ account: acc, debit: credit ? ex : 0, credit: credit ? 0 : ex, vat_grid: grid, description: l.description ?? null });
    }
  }
  vatTot = r2(vatTot); tot = r2(tot);
  if (inv.direction === "aankoop") {
    if (vatTot) out.push({ account: "411000", debit: credit ? 0 : vatTot, credit: credit ? vatTot : 0, vat_grid: credit ? "63" : "59" });
    out.push({ account: L, debit: credit ? tot : 0, credit: credit ? 0 : tot });
  } else {
    if (vatTot) out.push({ account: "451000", debit: credit ? vatTot : 0, credit: credit ? 0 : vatTot, vat_grid: credit ? "64" : "54" });
    out.push({ account: K, debit: credit ? 0 : tot, credit: credit ? tot : 0 });
  }
  return { lines: out };
}

/** Betaling via bank: aankoop D 440 / C 550, verkoop D 550 / C 400. Negatief bedrag = geld uit. */
export function paymentEntry(amount: number, bankAccount: string, counterAccount: string): JLine[] {
  const a = r2(Math.abs(amount));
  return amount < 0
    ? [{ account: counterAccount, debit: a, credit: 0 }, { account: bankAccount, debit: 0, credit: a }]
    : [{ account: bankAccount, debit: a, credit: 0 }, { account: counterAccount, debit: 0, credit: a }];
}

export type TBRow = { account: string; debit: number; credit: number; saldo: number };
export function trialBalance(lines: PostedLine[], from?: string, to?: string): TBRow[] {
  const m = new Map<string, TBRow>();
  for (const l of lines) {
    if (to && l.entry_date > to) continue;
    if (l.source === CLOSING_SOURCE && (!to || to.slice(0, 4) !== l.entry_date.slice(0, 4))) continue;
    // Resultaatrekeningen tellen enkel binnen de periode; balansrekeningen cumulatief.
    if (from && l.entry_date < from && isResultAccount(l.account)) continue;
    const r = m.get(l.account) ?? { account: l.account, debit: 0, credit: 0, saldo: 0 };
    r.debit = r2(r.debit + l.debit); r.credit = r2(r.credit + l.credit); r.saldo = r2(r.debit - r.credit);
    m.set(l.account, r);
  }
  return [...m.values()].sort((a, b) => a.account.localeCompare(b.account));
}

export function statements(tb: TBRow[]) {
  const sum = (f: (r: TBRow) => boolean) => r2(tb.filter(f).reduce((a, r) => a + r.saldo, 0));
  const belastingen = sum((r) => r.account.startsWith("67"));
  const kosten = r2(sum((r) => accountClass(r.account) === 6) - belastingen);
  const opbrengsten = r2(-sum((r) => accountClass(r.account) === 7));
  const resultaat = r2(opbrengsten - kosten - belastingen);
  const activa = sum((r) => [2, 3].includes(accountClass(r.account)) || (accountClass(r.account) >= 4 && accountClass(r.account) <= 5 && r.saldo > 0));
  const passivaZonderResultaat = r2(-sum((r) => accountClass(r.account) === 1 || (accountClass(r.account) >= 4 && accountClass(r.account) <= 5 && r.saldo < 0)));
  return { kosten, belastingen, opbrengsten, resultaat, activa, passiva: r2(passivaZonderResultaat + resultaat), sluit: r2(activa - passivaZonderResultaat - resultaat) === 0 };
}

/** Btw-overzicht per rooster. Bedragen op basis van boekingslijnen met rooster-code. */
export function vatReport(lines: PostedLine[], from: string, to: string) {
  const g: Record<string, number> = {};
  for (const l of lines) {
    if (!l.vat_grid || l.entry_date < from || l.entry_date > to) continue;
    g[l.vat_grid] = r2((g[l.vat_grid] ?? 0) + l.debit + l.credit);
  }
  const verschuldigd = r2((g["54"] ?? 0) + (g["63"] ?? 0));
  const aftrekbaar = r2((g["59"] ?? 0) + (g["64"] ?? 0));
  return { grids: g, verschuldigd, aftrekbaar, saldo: r2(verschuldigd - aftrekbaar) }; // >0 te betalen (71), <0 terug (72)
}

/** Rekeningschema/balans-import: kolommen rekening, naam en optioneel saldo of debet/credit. */
export type ImportedAccount = { number: string; name: string; saldo: number | null; err?: string };
export function parseAccountRows(rows: Record<string, unknown>[], map: { nr: string; naam: string; saldo?: string; debet?: string; credit?: string }): ImportedAccount[] {
  return rows.map((r) => {
    const raw = String(r[map.nr] ?? "").trim();
    const number = raw.replace(/\s|\./g, "");
    const name = String(r[map.naam] ?? "").trim();
    let saldo: number | null = null;
    if (map.saldo) saldo = parseAmount(r[map.saldo]);
    else if (map.debet || map.credit) {
      const d = map.debet ? parseAmount(r[map.debet]) ?? 0 : 0, c = map.credit ? parseAmount(r[map.credit]) ?? 0 : 0;
      saldo = d || c ? r2(d - c) : null;
    }
    const err = !/^[0-9]{1,10}$/.test(number) ? "ongeldig rekeningnummer" : !name ? "naam ontbreekt" : undefined;
    return { number, name, saldo, ...(err ? { err } : {}) };
  });
}

/** Openingsboeking uit balanssaldi (enkel balansrekeningen 1–5). Moet sluiten; anders fout. */
export function openingEntry(accs: ImportedAccount[]): { lines: JLine[]; diff: number } {
  const lines = accs.filter((a) => !a.err && a.saldo && accountClass(a.number) <= 5)
    .map((a) => { const saldo = a.saldo ?? 0; return { account: a.number, debit: saldo > 0 ? r2(saldo) : 0, credit: saldo < 0 ? r2(-saldo) : 0 }; });
  return { lines, diff: isBalanced(lines).diff };
}

/** Kies de eigen centralisatierekening van het bedrijf (bv. 440110) als die bestaat, anders de standaard. */
export function controlAccounts(numbers: string[]) {
  const pick = (prefix: string, std: string) => numbers.includes(std) ? std : numbers.filter((n) => n.startsWith(prefix)).sort()[0] ?? std;
  // 550200 is de zichtrekening: die krijgt voorrang op de generieke 550000.
  const bank = numbers.includes("550200") ? "550200" : pick("55", "550000");
  return { klanten: pick("400", "400000"), leveranciers: pick("440", "440000"), bank };
}
