export interface WachtrekeningLine {
  id: string;
  date: string | null;
  amount: number; // positive = incoming (credit), negative = outgoing (debit)
  counterparty: string;
  description: string;
  reference: string;
}

export interface BankTxCandidate {
  id: string;
  tx_date: string;
  amount: number;
  counterparty: string | null;
  counterparty_account: string | null;
  description: string | null;
  matched_invoice_id: string | null;
  matched_purchase_invoice_id: string | null;
  entry_id: string | null;
}

export interface PurchaseDocCandidate {
  id: string;
  invoice_number: string | null;
  supplier_name: string;
  invoice_date: string | null;
  total: number;
  status: string;
  payment_ref: string | null;
  kind: string;
}

export interface SalesDocCandidate {
  id: string;
  number: string;
  customer_name: string;
  issue_date: string;
  total: number;
  paid_amount: number;
  status: string;
  kind: string;
}

export interface DocumentMatch {
  type: "purchase" | "sales";
  id: string;
  number: string;
  party: string;
  date: string | null;
  total: number;
  status: string;
  score: number;
  reason: string;
}

export interface WachtrekeningMatchResult {
  line: WachtrekeningLine;
  bankTx: BankTxCandidate | null;
  bankReason: string | null;
  document: DocumentMatch | null;
  status: "document_found" | "bank_only" | "unmatched";
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function dayDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function tokenOverlap(a: string, b: string): number {
  const ta = a.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
  if (!ta.length || !tb.size) return 0;
  let hits = 0;
  for (const w of ta) if (tb.has(w)) hits++;
  return hits;
}

function matchBankTx(line: WachtrekeningLine, txs: BankTxCandidate[]): { tx: BankTxCandidate; reason: string } | null {
  const absAmt = Math.abs(line.amount);
  const lineText = `${line.counterparty} ${line.description} ${line.reference}`;
  const lineDigits = digits(line.reference || line.description);
  let best: { tx: BankTxCandidate; score: number; reason: string } | null = null;

  for (const tx of txs) {
    const diff = Math.abs(Math.abs(tx.amount) - absAmt);
    if (diff > 0.05) continue;
    // Prefer same sign when known
    if (line.amount !== 0 && tx.amount !== 0 && Math.sign(line.amount) !== Math.sign(tx.amount)) continue;

    let score = diff < 0.005 ? 40 : 25;
    const reasons: string[] = [diff < 0.005 ? "Exact bedrag" : "Bedrag (±€0,05)"];

    const dd = dayDiff(line.date, tx.tx_date);
    if (dd !== null) {
      if (dd <= 2) { score += 30; reasons.push("Datum komt overeen"); }
      else if (dd <= 7) { score += 18; reasons.push(`Datum ±${dd}d`); }
      else if (dd <= 31) { score += 6; }
      else continue;
    }

    const txText = `${tx.counterparty ?? ""} ${tx.description ?? ""}`;
    if (lineDigits.length >= 6 && digits(txText).includes(lineDigits)) {
      score += 35;
      reasons.push("Mededeling komt overeen");
    } else if (tokenOverlap(lineText, txText) >= 1) {
      score += 20;
      reasons.push("Tegenpartij/omschrijving");
    }

    if (!best || score > best.score) {
      best = { tx, score, reason: reasons.join(" · ") };
    }
  }

  return best && best.score >= 45 ? { tx: best.tx, reason: best.reason } : null;
}

function matchDocument(
  line: WachtrekeningLine,
  bankTx: BankTxCandidate | null,
  purchases: PurchaseDocCandidate[],
  sales: SalesDocCandidate[],
): DocumentMatch | null {
  // 1. Direct link already on the matched bank transaction
  if (bankTx?.matched_purchase_invoice_id) {
    const p = purchases.find((x) => x.id === bankTx.matched_purchase_invoice_id);
    if (p) {
      return {
        type: "purchase",
        id: p.id,
        number: p.invoice_number || "Zonder nr.",
        party: p.supplier_name,
        date: p.invoice_date,
        total: p.total,
        status: p.status,
        score: 100,
        reason: "Al gekoppeld via bankverrichting",
      };
    }
  }
  if (bankTx?.matched_invoice_id) {
    const s = sales.find((x) => x.id === bankTx.matched_invoice_id);
    if (s) {
      return {
        type: "sales",
        id: s.id,
        number: s.number,
        party: s.customer_name,
        date: s.issue_date,
        total: s.total,
        status: s.status,
        score: 100,
        reason: "Al gekoppeld via bankverrichting",
      };
    }
  }

  const absAmt = Math.abs(line.amount);
  const searchText = [line.counterparty, line.description, line.reference, bankTx?.counterparty, bankTx?.description]
    .filter(Boolean)
    .join(" ");
  const searchNorm = norm(searchText);
  const searchDigits = digits(searchText);
  const refDate = bankTx?.tx_date ?? line.date;

  let best: DocumentMatch | null = null;

  const checkCandidate = (
    type: "purchase" | "sales",
    id: string,
    number: string,
    party: string,
    date: string | null,
    total: number,
    status: string,
    extraRef?: string | null,
  ) => {
    const amtDiff = Math.abs(Math.abs(total) - absAmt);
    const numNorm = norm(number);
    const refDigits = digits(extraRef);
    const hasRefMatch =
      (numNorm.length >= 4 && searchNorm.includes(numNorm)) ||
      (refDigits.length >= 8 && searchDigits.includes(refDigits));

    if (amtDiff > 0.05 && !hasRefMatch) return;

    let score = 0;
    const reasons: string[] = [];

    if (amtDiff < 0.005) { score += 45; reasons.push("Exact bedrag"); }
    else if (amtDiff <= 0.05) { score += 30; reasons.push("Bedrag (±€0,05)"); }

    if (hasRefMatch) { score += 40; reasons.push("Factuurnr./mededeling"); }

    const overlap = tokenOverlap(party, searchText);
    if (overlap >= 1) { score += Math.min(30, overlap * 15); reasons.push("Naam komt overeen"); }

    const dd = dayDiff(refDate, date);
    if (dd !== null && dd <= 60) { score += 10; }
    else if (dd !== null && dd > 180) { score -= 15; }

    if (score >= 55 && (!best || score > best.score)) {
      best = { type, id, number: number || "Zonder nr.", party, date, total, status, score, reason: reasons.join(" · ") };
    }
  };

  // Outgoing (negative) -> prefer purchase invoices; incoming (positive) -> prefer sales invoices; check both as fallback for credit notes
  if (line.amount <= 0) {
    for (const p of purchases) checkCandidate("purchase", p.id, p.invoice_number ?? "", p.supplier_name, p.invoice_date, p.total, p.status, p.payment_ref);
  }
  if (line.amount >= 0) {
    for (const s of sales) checkCandidate("sales", s.id, s.number, s.customer_name, s.issue_date, s.total, s.status);
  }
  if (!best) {
    for (const p of purchases) checkCandidate("purchase", p.id, p.invoice_number ?? "", p.supplier_name, p.invoice_date, p.total, p.status, p.payment_ref);
    for (const s of sales) checkCandidate("sales", s.id, s.number, s.customer_name, s.issue_date, s.total, s.status);
  }

  return best;
}

export function matchWachtrekeningLines(
  lines: WachtrekeningLine[],
  bankTxs: BankTxCandidate[],
  purchases: PurchaseDocCandidate[],
  sales: SalesDocCandidate[],
): WachtrekeningMatchResult[] {
  return lines.map((line) => {
    const bankHit = matchBankTx(line, bankTxs);
    const doc = matchDocument(line, bankHit?.tx ?? null, purchases, sales);
    const status: WachtrekeningMatchResult["status"] = doc
      ? "document_found"
      : bankHit
        ? "bank_only"
        : "unmatched";
    return {
      line,
      bankTx: bankHit?.tx ?? null,
      bankReason: bankHit?.reason ?? null,
      document: doc,
      status,
    };
  });
}