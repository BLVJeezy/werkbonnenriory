export type PurchaseLine = {
  description: string;
  quantity: number;
  unit: string;
  /** Price per piece as the document shows it. */
  unitPrice: number;
  /** Line total without tax — the anchor every sum and booking uses. */
  amount: number;
  account?: string | null;
  /** Tax percentage as read from the document (0, 6, 12, 21…); null when the document does not say. */
  vatRate?: number | null;
  /** Tax amount of this line, read or derived; null when the document gives no clue at all. */
  vat?: number | null;
  /** Line total including tax, read or derived; null when unknown. */
  total?: number | null;
  /** Discount metadata only: amount is already net AFTER this discount. */
  discountPercent?: number | null;
  discountAmount?: number | null;
  discountBase?: number | null;
};

export type ParsedPurchaseInvoice = {
  supplierName: string;
  supplierVat: string | null;
  supplierIban: string | null;
  supplierBic: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  lines: PurchaseLine[];
  net: number;
  vat: number;
  total: number;
  paymentRef: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? Number(v.replace(",", ".")) || 0 : 0);
const optionalNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isoDate = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
/** A BIC is always upper case and written without spaces, so the same code stays in one shape. */
const bic = (v: unknown) => {
  const s = str(v);
  return s ? s.toUpperCase().replace(/\s/g, "") : null;
};

/** A tax percentage is 0..100; "21", "21%", 21,5 are all accepted, anything else is unknown. */
const vatRateValue = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace("%", "").trim());
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
};

const VAT_GRID = [0, 6, 12, 21];

/** Pure: the percentage behind a known net + tax pair, snapped to the Belgian grid when it nearly matches. */
function rateFromVat(net: number, vat: number): number {
  const raw = (vat / net) * 100;
  return VAT_GRID.find((g) => Math.abs(g - raw) < 0.5) ?? Math.round(raw * 10) / 10;
}

/** Pure: normalizes raw AI output into a clean purchase invoice; never trusts the AI's totals blindly. */
export function normalizePurchaseInvoice(raw: unknown): ParsedPurchaseInvoice {
  const o = (raw ?? {}) as Record<string, unknown>;
  const lines: PurchaseLine[] = (Array.isArray(o["lines"]) ? o["lines"] : []).slice(0, 200).map((l) => {
    const lo = (l ?? {}) as Record<string, unknown>;
    const quantity = num(lo["quantity"]) || 1;
    const unit = str(lo["unit"]) ?? "st";
    const unitPrice = num(lo["unitPrice"]);
    const rate = vatRateValue(lo["vatRate"]);
    const discountPercent = vatRateValue(lo["discountPercent"]);
    const discountAmount = optionalNum(lo["discountAmount"]);
    const base = optionalNum(lo["discountBase"]) ?? r2(quantity * unitPrice);
    const discount = discountAmount ?? (discountPercent !== null ? r2(base * discountPercent / 100) : 0);
    // What the document states wins; a missing figure is derived from the rest of the line, never invented.
    const statedNet = optionalNum(lo["net"]) ?? optionalNum(lo["amount"]);
    let net = r2(statedNet ?? (base - discount));
    let vat: number | null = optionalNum(lo["vat"]);
    let total: number | null = optionalNum(lo["total"]);
    if (!net && total && vat) net = r2(total - vat);
    if (!net && total && rate !== null) net = r2(total / (1 + rate / 100));
    if (vat === null && total !== null && net) vat = r2(total - net);
    if (vat === null && rate !== null && net) vat = r2(net * rate / 100);
    if (total === null && net && vat !== null) total = r2(net + vat);
    if (total === null && net && rate !== null) total = r2(net * (1 + rate / 100));
    const vatRate = rate ?? (net && vat !== null ? rateFromVat(net, vat) : null);
    return {
      description: str(lo["description"]) ?? "Lijn",
      quantity,
      unit,
      unitPrice,
      amount: net,
      ...(str(lo["account"]) ? { account: str(lo["account"]) } : {}),
      vatRate,
      vat,
      total,
      ...(discountPercent !== null || discountAmount !== null ? {
        discountPercent, discountAmount: r2(discount), discountBase: r2(net + discount),
      } : {}),
    };
  });
  const linesNet = r2(lines.reduce((s, l) => s + l.amount, 0));
  const total = r2(num(o["total"]));
  const vat = r2(num(o["vat"]));
  // Prefer the invoice's own total; fall back to the sum of the lines.
  const net = r2(num(o["net"])) || (total ? r2(total - vat) : linesNet);
  return {
    supplierName: str(o["supplierName"]) ?? "Onbekend",
    supplierVat: str(o["supplierVat"]),
    supplierIban: str(o["supplierIban"]),
    supplierBic: bic(o["supplierBic"]),
    invoiceNumber: str(o["invoiceNumber"]),
    invoiceDate: isoDate(o["invoiceDate"]),
    dueDate: isoDate(o["dueDate"]),
    lines,
    net,
    vat,
    total: total || r2(net + vat),
    paymentRef: str(o["paymentRef"]),
  };
}

/** Explicit user edit: replace the discount, never subtract it a second time. */
export function setPurchaseLineDiscount(line: PurchaseLine, value: number, mode: "percent" | "amount"): PurchaseLine {
  if (!Number.isFinite(value) || value < 0) throw new Error("Korting moet een positief getal zijn");
  const base = r2(line.discountBase ?? line.amount + (line.discountAmount ?? 0));
  if (base < 0) throw new Error("Geen korting op een negatieve lijn");
  const discount = r2(mode === "percent" ? base * value / 100 : value);
  if ((mode === "percent" && value > 100) || discount > base) throw new Error("Korting mag niet groter zijn dan het lijnbedrag");
  const amount = r2(base - discount);
  const vat = line.vatRate != null ? r2(amount * line.vatRate / 100) : null;
  return { ...line, discountBase: base, discountPercent: mode === "percent" ? value : null, discountAmount: discount, amount, vat, total: vat === null ? null : r2(amount + vat) };
}

/** Adjust document totals by the edited lines' delta; keep unrelated source differences intact. */
export function purchaseDiscountTotals(before: PurchaseLine[], after: PurchaseLine[], totals: { net: number; vat: number; total: number }) {
  const sum = (lines: PurchaseLine[]) => lines.reduce((s, l) => { const t = lineTotals(l); return { net: s.net + t.net, vat: s.vat + t.vat }; }, { net: 0, vat: 0 });
  const a = sum(before), b = sum(after);
  const net = r2(totals.net + b.net - a.net), vat = r2(totals.vat + b.vat - a.vat);
  return { net, vat, total: r2(totals.total + b.net - a.net + b.vat - a.vat) };
}

/** Pure: the three amounts of one line — what is known, plus what follows from the tax percentage. */
export function lineTotals(l: PurchaseLine): { net: number; vat: number; total: number } {
  const net = r2(num(l.amount));
  const vat = l.vat ?? (l.vatRate != null ? r2(net * l.vatRate / 100) : 0);
  return { net, vat: r2(vat), total: r2(l.total ?? net + vat) };
}

/** Pure: consistency warnings the admin should check before approving. */
export function purchaseInvoiceWarnings(inv: ParsedPurchaseInvoice): string[] {
  const w: string[] = [];
  const linesNet = r2(inv.lines.reduce((s, l) => s + l.amount, 0));
  if (inv.lines.length && Math.abs(linesNet - inv.net) > 0.02) w.push(`Som van de lijnen (${linesNet.toFixed(2)}) wijkt af van het nettobedrag (${inv.net.toFixed(2)})`);
  if (Math.abs(inv.net + inv.vat - inv.total) > 0.02) w.push("Netto + btw klopt niet met het totaal");
  if (inv.lines.some((l) => l.vat != null || l.vatRate != null)) {
    const linesVat = r2(inv.lines.reduce((s, l) => s + lineTotals(l).vat, 0));
    if (Math.abs(linesVat - inv.vat) > 0.02) w.push(`Btw van de lijnen (${linesVat.toFixed(2)}) wijkt af van de btw op het document (${inv.vat.toFixed(2)})`);
  }
  if (!inv.total) w.push("Geen totaalbedrag gevonden");
  if (!inv.supplierIban) w.push("Geen IBAN van de leverancier gevonden — nodig om te betalen");
  if (!inv.dueDate) w.push("Geen vervaldag gevonden");
  if (!inv.invoiceNumber) w.push("Geen factuurnummer gevonden");
  return w;
}
