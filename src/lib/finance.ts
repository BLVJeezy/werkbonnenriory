// Pure financelogica: geen database, geen browser. Gedeeld door UI, taken en tests.

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const monthKey = (d: string | Date) => {
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 7) + "-01";
};
export const addMonths = (m: string, n: number) => {
  const [y = 0, mo = 1] = m.split("-").map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
const monthDiff = (a: string, b: string) => {
  const [ya = 0, ma = 1] = a.split("-").map(Number);
  const [yb = 0, mb = 1] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export const normSupplier = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/\b(bv|bvba|nv|vzw|srl|sprl|comm\.?v|cv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Het bedrijf "Privé" (enkel voor mailindeling) hoort niet in Finance/Boekhouding. */
export const isPrivateCompany = (name: string | null | undefined) =>
  (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === "prive";

// ---------- Afschrijvingen ----------
// Prorata-beleid: lineair per maand; de maand van de startdatum telt als volledige maand,
// ongeacht de dag. Bij een openingssaldo (opening_accumulated per opening_cutoff) wordt enkel het
// resterende afschrijfbare bedrag over de resterende maanden na de cutoff-maand verdeeld.
// Laatste maand krijgt het afrondingsverschil; boekwaarde zakt nooit onder restwaarde.
// Bij buitengebruikstelling (disposal_date) stopt de afschrijving na die maand. Grond: geen afschrijving.
export type Investment = {
  capitalizable_amount: number | null;
  purchase_amount?: number | null;
  start_date: string | null;
  useful_life_months: number | null;
  residual_value: number;
  opening_accumulated: number;
  opening_cutoff: string | null;
  is_land: boolean;
  disposal_date: string | null;
};
export type DeprRow = { month: string; depreciation: number; accumulated: number; bookValue: number };

export function missingDeprParams(i: Investment): string[] {
  if (i.is_land) return [];
  const m: string[] = [];
  if (i.capitalizable_amount == null && i.purchase_amount == null) m.push("aanschafwaarde");
  if (!i.start_date) m.push("startdatum");
  if (!i.useful_life_months) m.push("levensduur");
  if (i.opening_accumulated > 0 && !i.opening_cutoff) m.push("cutoff-datum openingssaldo");
  return m;
}

export function depreciationSchedule(i: Investment): DeprRow[] {
  if (i.is_land || missingDeprParams(i).length || validateInvestment(i).length) return [];
  const cost = i.capitalizable_amount ?? i.purchase_amount;
  const life = i.useful_life_months;
  if (cost == null || !i.start_date || life == null) return [];
  const start = monthKey(i.start_date);
  const base = cost - i.residual_value;
  let acc = i.opening_accumulated;
  let first = start;
  let months = life;
  if (i.opening_cutoff && i.opening_accumulated > 0) {
    const cut = monthKey(i.opening_cutoff);
    first = addMonths(cut, 1);
    months = life - (monthDiff(start, cut) + 1);
  }
  const remaining = r2(base - acc);
  if (months <= 0 || remaining <= 0) return [];
  const monthly = r2(remaining / months);
  const stop = i.disposal_date ? monthKey(i.disposal_date) : null;
  const rows: DeprRow[] = [];
  let done = 0;
  for (let k = 0; k < months; k++) {
    const month = addMonths(first, k);
    if (stop && month > stop) break;
    let d = k === months - 1 ? r2(remaining - done) : monthly;
    if (done + d > remaining) d = r2(remaining - done);
    done = r2(done + d);
    acc = r2(acc + d);
    rows.push({ month, depreciation: d, accumulated: acc, bookValue: r2(cost - acc) });
  }
  return rows;
}

// Jaaroverzicht van een afschrijvingsschema: boekwaarde begin, afschrijving, boekwaarde einde per jaar.
export type DeprYear = { year: number; months: number; begin: number; depreciation: number; accumulated: number; end: number };
export function depreciationByYear(rows: DeprRow[]): DeprYear[] {
  const out: DeprYear[] = [];
  for (const r of rows) {
    const year = Number(r.month.slice(0, 4));
    let y = out.at(-1);
    if (!y || y.year !== year) { y = { year, months: 0, begin: r2(r.bookValue + r.depreciation), depreciation: 0, accumulated: 0, end: 0 }; out.push(y); }
    y.months++;
    y.depreciation = r2(y.depreciation + r.depreciation);
    y.accumulated = r.accumulated;
    y.end = r.bookValue;
  }
  return out;
}

// ---------- Leningen (annuïteit) ----------
// Aflossing kapitaal is een kasstroom, geen kost; enkel interest is een kost. Niet combineren met afschrijving.
export type LoanRow = { month: string; payment: number; interest: number; principal: number; balance: number };
export function loanSchedule(principal: number, annualRate: number, months: number, startDate: string): LoanRow[] {
  const i = annualRate / 100 / 12;
  const pay = i === 0 ? principal / months : (principal * i) / (1 - Math.pow(1 + i, -months));
  let bal = principal;
  const rows: LoanRow[] = [];
  for (let k = 0; k < months; k++) {
    const interest = r2(bal * i);
    let pr = r2(pay - interest);
    if (k === months - 1) pr = r2(bal);
    bal = r2(bal - pr);
    rows.push({ month: addMonths(monthKey(startDate), k), payment: r2(pr + interest), interest, principal: pr, balance: bal });
  }
  return rows;
}

// ---------- Boekingsregels (deterministisch, geen AI-training) ----------
export type Rule = { id: string; supplier_key: string; keyword: string; account: string; category: string; scope: string; hits: number; enabled: boolean };
export type Suggestion = { account: string; category: string; confidence: number; ruleId: string; reason: string } | null;

export function suggest(rules: Rule[], supplier: string | null, description: string | null): Suggestion {
  const key = normSupplier(supplier);
  const desc = normSupplier(description);
  const own = rules.filter((r) => r.enabled && r.supplier_key === key);
  const kw = own.filter((r) => r.keyword && desc.includes(r.keyword)).sort((a, b) => b.keyword.length - a.keyword.length);
  if (kw.length) {
    const r = kw[0];
    if (!r) return null;
    const conflict = kw.some((o) => o.account !== r.account && o.keyword.length === r.keyword.length);
    if (!conflict) return { account: r.account, category: r.category, ruleId: r.id, confidence: r2(Math.min(0.95, 0.6 + 0.1 * r.hits)), reason: `leverancier + "${r.keyword}"` };
  }
  const sup = own.filter((r) => r.scope === "leverancier");
  const accounts = new Set(own.map((r) => r.account));
  if (sup.length && accounts.size === 1) {
    const r = sup[0];
    if (!r) return null;
    return { account: r.account, category: r.category, ruleId: r.id, confidence: r2(Math.min(0.8, 0.4 + 0.1 * r.hits)), reason: "enkel leverancier" };
  }
  return null; // nieuw of dubbelzinnig (bv. Yappa: publiciteit én cursussen) -> beoordelen
}

export function keywordFrom(description: string | null) {
  return normSupplier(description).split(" ").filter((w) => w.length >= 4).slice(0, 2).join(" ");
}

// ---------- Maandoverzicht ----------
// Kosten/omzet: maandtotalen vervangen details en facturen van dezelfde categorie (geen dubbeltelling).
// Investeringslijnen zijn geen bedrijfskost; die lopen via afschrijving.
// Afschrijving (rekening 630*) en interest (650*/651*) uit de boekhouding gaan voor op berekende waarden.
// Kassaldo's zijn momentopnames: per bankrekening (categorie) telt enkel de laatst ingevoerde stand.
export type Entry = { month: string; kind: "omzet" | "kost" | "kas"; category: string; amount: number; level: "detail" | "totaal"; account?: string | null; created_at?: string };
export type InvLine = { month: string; direction: "aankoop" | "verkoop"; doc_type: "factuur" | "creditnota"; category: string | null; ex_vat: number; approved: boolean; is_investment?: boolean };
export type MonthSummary = {
  revenue: number | null; costs: number | null; profit: number | null; cash: number | null;
  depreciation: number | null; interest: number | null; deprFromLedger: boolean; interestFromLedger: boolean;
  excludedInvoiceLines: number; unapprovedLines: number; investmentLines: number;
};

export function summarizeMonth(month: string, entries: Entry[], lines: InvLine[], generated: { depreciation: number | null; interest: number | null } = { depreciation: null, interest: null }): MonthSummary {
  const e = entries.filter((x) => x.month === month);
  const l = lines.filter((x) => x.month === month);
  const totalsCats = new Set(e.filter((x) => x.level === "totaal").map((x) => `${x.kind}|${x.category}`));
  let excluded = 0, unapproved = 0, investments = 0;
  const sum = (kind: "omzet" | "kost") => {
    let has = false, s = 0;
    for (const x of e.filter((y) => y.kind === kind)) {
      if (x.level === "detail" && totalsCats.has(`${kind}|${x.category}`)) continue;
      has = true; s += x.amount;
    }
    for (const x of l.filter((y) => (kind === "omzet" ? y.direction === "verkoop" : y.direction === "aankoop"))) {
      if (x.is_investment) { investments++; continue; }
      if (!x.approved) { unapproved++; continue; }
      if (totalsCats.has(`${kind}|${x.category ?? ""}`)) { excluded++; continue; }
      has = true; s += x.doc_type === "creditnota" ? -Math.abs(x.ex_vat) : x.ex_vat;
    }
    return has ? r2(s) : null;
  };
  const revenue = sum("omzet");
  const costs = sum("kost");
  const costEntries = e.filter((x) => x.kind === "kost");
  const deprFromLedger = costEntries.some((x) => (x.account ?? "").startsWith("630"));
  const interestFromLedger = costEntries.some((x) => /^65[01]/.test(x.account ?? ""));
  const depreciation = deprFromLedger ? null : generated.depreciation;
  const interest = interestFromLedger ? null : generated.interest;
  const latest = new Map<string, Entry>();
  for (const x of e.filter((y) => y.kind === "kas")) {
    const p = latest.get(x.category);
    if (!p || (x.created_at ?? "") >= (p.created_at ?? "")) latest.set(x.category, x);
  }
  const cash = latest.size ? r2([...latest.values()].reduce((a, b) => a + b.amount, 0)) : null;
  return {
    revenue, costs,
    profit: revenue != null && costs != null ? r2(revenue - costs - (depreciation ?? 0) - (interest ?? 0)) : null,
    cash, depreciation, interest, deprFromLedger, interestFromLedger,
    excludedInvoiceLines: excluded, unapprovedLines: unapproved, investmentLines: investments,
  };
}

export function dedupeKey(parts: (string | number | null | undefined)[]) {
  return parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|");
}

// Debet/credit: kost = debet positief, credit negatief; omzet = credit positief.
export function signedAmount(kind: "omzet" | "kost" | "kas", debit: number | null, credit: number | null, amount: number | null) {
  if (debit != null || credit != null) {
    const d = debit ?? 0, c = credit ?? 0;
    return kind === "omzet" ? r2(c - d) : r2(d - c);
  }
  return amount;
}

export function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[€\s]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------- Financetaken ----------
export type FinTask = { key: string; title: string; body: string; priority: "hoog" | "normaal"; due: string | null };
export type TaskInvoice = { id: string; direction: string; number: string | null; counterparty: string | null; due_date: string | null; status: string; review_status: string; total: number; bank_ref?: string | null; paid_at?: string | null };
export type TaskInput = {
  companyName: string;
  today: string;
  invoices: TaskInvoice[];
  investments: (Investment & { id: string; name: string })[];
  budgets: { category: string; month: string; amount: number }[];
  actualByCat: Record<string, number>;
  months: { month: string; complete: boolean }[];
  simpla: { bound: boolean; lastSuccess: string | null };
};

// Sleutels zijn stabiel per bron-incident (nooit datum-afhankelijk), zodat dagelijks herberekenen geen nieuwe taken maakt.
export function buildFinanceTasks(x: TaskInput): FinTask[] {
  const t: FinTask[] = [];
  const eur = (n: number) => `€ ${n.toFixed(2)}`;
  for (const i of x.invoices) {
    const ref = `${i.counterparty ?? "?"} ${i.number ?? ""}`.trim();
    if (i.review_status === "te_beoordelen")
      t.push({ key: `inv-review:${i.id}`, title: `Factuur indelen: ${ref}`, body: `Factuur ${ref} (${eur(i.total)}) heeft nog geen goedgekeurde rekening/categorie.\nOpen: /finance?tab=facturen&id=${i.id}`, priority: "normaal", due: null });
    if (i.status !== "open" || !i.due_date) continue;
    if (i.due_date < x.today)
      t.push({
        key: `${i.direction === "verkoop" ? "recv-overdue" : "bill-overdue"}:${i.id}`,
        title: i.direction === "verkoop" ? `Openstaande klantfactuur vervallen: ${ref}` : `Leveranciersfactuur vervallen: ${ref}`,
        body: `${eur(i.total)}, vervallen op ${i.due_date}. Geen automatische betaling of mail.\nOpen: /finance?tab=facturen&id=${i.id}`,
        priority: "hoog", due: x.today,
      });
    else if (i.direction === "aankoop" && i.due_date <= addDays(x.today, 7))
      t.push({ key: `bill-due:${i.id}`, title: `Factuur te betalen: ${ref}`, body: `${eur(i.total)} vervalt op ${i.due_date}.\nOpen: /finance?tab=facturen&id=${i.id}`, priority: "normaal", due: i.due_date });
  }
  for (const v of x.investments) {
    const miss = missingDeprParams(v);
    if (miss.length) t.push({ key: `inv-params:${v.id}`, title: `Afschrijving onvolledig: ${v.name}`, body: `Ontbreekt: ${miss.join(", ")}.\nOpen: /finance?tab=investeringen&id=${v.id}`, priority: "normaal", due: null });
  }
  for (const b of x.budgets) {
    const a = x.actualByCat[`${b.month}|${b.category}`];
    if (a != null && a > b.amount) t.push({ key: `budget:${b.month}:${b.category}`, title: `Budget overschreden: ${b.category} ${b.month.slice(0, 7)}`, body: `Werkelijk ${eur(a)} t.o.v. budget ${eur(b.amount)}.\nOpen: /finance?tab=budget`, priority: "normaal", due: null });
  }
  const prev = addMonths(monthKey(x.today), -1);
  if (!x.months.find((m) => m.month === prev)?.complete)
    t.push({ key: `month-incomplete:${prev}`, title: `Maand ${prev.slice(0, 7)} onvolledig`, body: `Omzet, kosten of bank zijn nog niet als volledig gemarkeerd.\nOpen: /finance?tab=overzicht&maand=${prev}`, priority: "normaal", due: null });
  // Enkel voor het bedrijf dat aan Simpla gekoppeld is; één incident tot er weer een geslaagde sync is.
  if (x.simpla.bound && (!x.simpla.lastSuccess || Date.parse(x.today) - Date.parse(x.simpla.lastSuccess.slice(0, 10)) > 2 * 864e5))
    t.push({ key: `sync-stale:simpla:${x.simpla.lastSuccess ?? "nooit"}`, title: `Simpla-facturen niet recent gesynchroniseerd`, body: `Laatste geslaagde sync: ${x.simpla.lastSuccess ?? "nooit"}.\nOpen: /finance?tab=koppelingen`, priority: "normaal", due: null });
  return t.map((k) => ({ ...k, title: `${k.title} — ${x.companyName}` }));
}

// Automatisch afsluiten enkel met expliciet bewijs op een bestaand bronrecord.
// Verdwijnen, verwijderen, betwisting of een leesfout is nooit bewijs.
export function resolutionEvidence(key: string, src: { invoices: Map<string, TaskInvoice>; investments: Map<string, Investment> }): string | null {
  const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (kind === "inv-review") {
    const i = src.invoices.get(id);
    return i && i.review_status === "goedgekeurd" ? "factuur goedgekeurd" : null;
  }
  if (kind === "recv-overdue" || kind === "bill-overdue" || kind === "bill-due") {
    const i = src.invoices.get(id);
    return i && i.status === "betaald" && (i.bank_ref || i.paid_at) ? `betaald (${i.bank_ref ?? i.paid_at})` : null;
  }
  if (kind === "inv-params") {
    const v = src.investments.get(id);
    return v && missingDeprParams(v).length === 0 ? "parameters volledig" : null;
  }
  return null;
}

export function addDays(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// Validatie vóór opslaan (de database dwingt dezelfde grenzen af).
export function validateInvestment(i: Investment): string[] {
  const e: string[] = [];
  const cost = i.capitalizable_amount ?? i.purchase_amount ?? null;
  if (i.useful_life_months != null && (!Number.isInteger(i.useful_life_months) || i.useful_life_months <= 0)) e.push("levensduur moet een positief geheel aantal maanden zijn");
  if (cost != null && cost < 0) e.push("bedrag mag niet negatief zijn");
  if (i.residual_value < 0 || (cost != null && i.residual_value > cost)) e.push("restwaarde buiten bereik");
  if (i.opening_accumulated < 0 || (cost != null && i.opening_accumulated > cost - i.residual_value)) e.push("openingssaldo buiten bereik");
  if (i.opening_accumulated > 0 && !i.opening_cutoff) e.push("cutoff-datum vereist bij openingssaldo");
  for (const d of [i.start_date, i.opening_cutoff, i.disposal_date]) if (d && Number.isNaN(Date.parse(d))) e.push(`ongeldige datum ${d}`);
  if (i.start_date && i.opening_cutoff && i.opening_cutoff < i.start_date) e.push("cutoff voor startdatum");
  if (i.start_date && i.disposal_date && i.disposal_date < i.start_date) e.push("buitengebruikstelling voor startdatum");
  return e;
}
export function validateLoan(principal: number | null, rate: number | null, months: number | null): string[] {
  const e: string[] = [];
  if (principal == null || principal <= 0) e.push("hoofdsom moet positief zijn");
  if (rate == null || rate < 0 || rate >= 100) e.push("rente buiten bereik");
  if (months == null || !Number.isInteger(months) || months <= 0 || months > 600) e.push("looptijd 1–600 maanden");
  return e;
}
