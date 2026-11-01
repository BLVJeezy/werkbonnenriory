export type PurchaseLine = { description: string; quantity: number; unit: string; unitPrice: number; amount: number; account?: string | null };

export type ParsedPurchaseInvoice = {
  supplierName: string;
  supplierVat: string | null;
  supplierIban: string | null;
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
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isoDate = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** Pure: normalizes raw AI output into a clean purchase invoice; never trusts the AI's totals blindly. */
export function normalizePurchaseInvoice(raw: unknown): ParsedPurchaseInvoice {
  const o = (raw ?? {}) as Record<string, unknown>;
  const lines: PurchaseLine[] = (Array.isArray(o["lines"]) ? o["lines"] : []).slice(0, 200).map((l) => {
    const lo = (l ?? {}) as Record<string, unknown>;
    const quantity = num(lo["quantity"]) || 1;
    const unitPrice = num(lo["unitPrice"]);
    return {
      description: str(lo["description"]) ?? "Lijn",
      quantity,
      unit: str(lo["unit"]) ?? "st",
      unitPrice,
      amount: r2(num(lo["amount"]) || quantity * unitPrice),
      ...(str(lo["account"]) ? { account: str(lo["account"]) } : {}),
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

/** Pure: consistency warnings the admin should check before approving. */
export function purchaseInvoiceWarnings(inv: ParsedPurchaseInvoice): string[] {
  const w: string[] = [];
  const linesNet = r2(inv.lines.reduce((s, l) => s + l.amount, 0));
  if (inv.lines.length && Math.abs(linesNet - inv.net) > 0.02) w.push(`Som van de lijnen (${linesNet.toFixed(2)}) wijkt af van het nettobedrag (${inv.net.toFixed(2)})`);
  if (Math.abs(inv.net + inv.vat - inv.total) > 0.02) w.push("Netto + btw klopt niet met het totaal");
  if (!inv.total) w.push("Geen totaalbedrag gevonden");
  if (!inv.supplierIban) w.push("Geen IBAN van de leverancier gevonden — nodig om te betalen");
  if (!inv.dueDate) w.push("Geen vervaldag gevonden");
  if (!inv.invoiceNumber) w.push("Geen factuurnummer gevonden");
  return w;
}
