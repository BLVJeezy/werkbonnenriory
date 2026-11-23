import { invoiceIdentity } from "./product-sales";

export type RevenueSourceFilter = "all" | "werkbonnen" | "simpla";
export type BreakdownMetric = "revenue" | "count";

export type AppInvoiceInput = {
  id: string;
  number: string;
  issue_date: string;
  kind: string;
  status: string;
  net: number;
  lines: unknown;
};

export type SimplaInvoiceLineInput = {
  description: string | null;
  ex_vat: number;
};

export type SimplaInvoiceInput = {
  id: string;
  number: string;
  invoice_date: string;
  doc_type: string;
  status: string;
  source: string;
  lines: SimplaInvoiceLineInput[];
};

export type BreakdownSlice = {
  key: string;
  label: string;
  amountExVat: number;
  quantity: number;
  sharePct: number;
  isOther?: boolean;
  isUnassigned?: boolean;
};

export type AnnualRevenueSummary = {
  year: number;
  sourceFilter: RevenueSourceFilter;
  metric: BreakdownMetric;
  totalExVat: number;
  werkbonnenExVat: number;
  simplaExVat: number;
  invoiceCount: number;
  creditNoteCount: number;
  werkbonnenDocCount: number;
  simplaDocCount: number;
  deduplicatedCount: number;
  simplaMinDate: string | null;
  simplaMaxDate: string | null;
  simplaIncomplete: boolean;
  slices: BreakdownSlice[];
};

const EXCLUDED_STATUSES = new Set([
  "concept",
  "draft",
  "geannuleerd",
  "cancelled",
  "canceled",
  "void",
  "proforma",
]);

export const UNASSIGNED_LABEL = "Niet toegewezen";
export const OTHER_LABEL = "Overige";

const round2 = (v: number) => Math.round(v * 100) / 100;

const normText = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export function isExcludedStatus(status: string | null | undefined): boolean {
  return EXCLUDED_STATUSES.has(normText(status ?? ""));
}

export function categorizeLineLabel(raw: string | null | undefined): string {
  const firstLine = String(raw ?? "").split(/\r?\n/)[0]?.trim() ?? "";
  if (!firstLine) return UNASSIGNED_LABEL;

  const cleaned = firstLine
    .replace(/\s*\(werkbon\s*#?\d+\)\s*$/i, "")
    .replace(/^arbeid\s*[–-]\s*/i, "")
    .trim();
  if (!cleaned) return UNASSIGNED_LABEL;

  const low = normText(cleaned);
  if (low.includes("forfait niet gestarte interventie")) return "Forfait geen interventie";
  if (low.includes("camera-inspectie 32-50")) return "Camera-inspectie 32-50";
  if (low.includes("camera-inspectie 75-110")) return "Camera-inspectie 75-110";
  if (low.includes("camera-inspectie 125-250")) return "Camera-inspectie 125-250";
  if (low.includes("camera-inspectie")) return "Camera-inspectie (overig)";
  if (low.includes("septische")) return "Ledigen septische put";
  if (/regen(water)?put/.test(low) && low.includes("reinig")) return "Reiniging regenput";
  if (low.includes("riostop") || low.includes("inspectiepunt")) return "Riostoppen / inspectiepunten";
  if (low.includes("verplaatsing") || low.includes("voorrijkosten") || low.includes("kilometervergoeding")) {
    return "Verplaatsingskosten";
  }
  if (low.includes("interventie") && low.includes("urgentie")) return "Interventie / ontstopping (urgentie)";
  if (low.includes("interventie") && low.includes("weekend")) return "Interventie / ontstopping (weekend)";
  if (low.includes("interventie") && low.includes("wachtdienst")) return "Interventie / ontstopping (wachtdienst)";
  if (
    (low.includes("interventie") && (low.includes("dagtarief") || low.includes("(dag)") || low.includes("ontstopping"))) ||
    low.includes("technische interventie")
  ) {
    return "Interventie / ontstopping (dagtarief)";
  }
  if (low.includes("herstelling") || low.includes("grondwerk")) return "Herstelling / grondwerk";

  const label = cleaned.length > 48 ? `${cleaned.slice(0, 45).trim()}…` : cleaned;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type AggBucket = { label: string; amountExVat: number; quantity: number };

export function buildAnnualRevenueSummary(params: {
  year: number;
  sourceFilter: RevenueSourceFilter;
  metric: BreakdownMetric;
  appInvoices: AppInvoiceInput[];
  simplaInvoices: SimplaInvoiceInput[];
  maxCategories?: number;
  todayIso?: string;
}): AnnualRevenueSummary {
  const { year, sourceFilter, metric, appInvoices, simplaInvoices, maxCategories = 6 } = params;
  const yearPrefix = `${year}-`;
  const seenNumbers = new Set<string>();

  let werkbonnenExVat = 0;
  let simplaExVat = 0;
  let invoiceCount = 0;
  let creditNoteCount = 0;
  let werkbonnenDocCount = 0;
  let simplaDocCount = 0;
  let deduplicatedCount = 0;
  let simplaMinDate: string | null = null;
  let simplaMaxDate: string | null = null;

  const buckets = new Map<string, AggBucket>();
  const unassigned: AggBucket = { label: UNASSIGNED_LABEL, amountExVat: 0, quantity: 0 };
  let hasUnassigned = false;

  const addLine = (rawDesc: string | null | undefined, amount: number, qty: number) => {
    const label = categorizeLineLabel(rawDesc);
    if (label === UNASSIGNED_LABEL) {
      unassigned.amountExVat += amount;
      unassigned.quantity += qty;
      hasUnassigned = true;
      return;
    }
    const key = normText(label);
    const prev = buckets.get(key);
    if (prev) {
      prev.amountExVat += amount;
      prev.quantity += qty;
    } else {
      buckets.set(key, { label, amountExVat: amount, quantity: qty });
    }
  };

  // 1. Werkbonnenriory invoices (always scanned first so deduplication favors app snapshots)
  for (const doc of appInvoices) {
    if (!doc.issue_date?.startsWith(yearPrefix) || isExcludedStatus(doc.status)) continue;
    const idKey = invoiceIdentity(doc.number || doc.id);
    if (seenNumbers.has(idKey)) continue;
    seenNumbers.add(idKey);

    if (sourceFilter === "simpla") continue;

    const isCredit = doc.kind === "creditnota";
    const rawLines = Array.isArray(doc.lines) ? (doc.lines as Record<string, unknown>[]) : [];
    let docNet = 0;

    if (rawLines.length > 0) {
      for (const line of rawLines) {
        const rawQty = Number(line["quantity"] ?? 1);
        const rawAmount = Number(line["amount"] ?? rawQty * Number(line["unitPrice"] ?? 0));
        if (!Number.isFinite(rawAmount) || !Number.isFinite(rawQty)) continue;
        const signedAmount = isCredit ? -Math.abs(rawAmount) : rawAmount;
        const signedQty = isCredit ? -Math.abs(rawQty) : rawQty;
        docNet += signedAmount;
        addLine(String(line["description"] ?? ""), signedAmount, signedQty);
      }
    } else {
      const fallbackNet = Number(doc.net ?? 0);
      const signedAmount = isCredit ? -Math.abs(fallbackNet) : fallbackNet;
      docNet += signedAmount;
      addLine("", signedAmount, isCredit ? -1 : 1);
    }

    werkbonnenExVat += docNet;
    werkbonnenDocCount += 1;
    if (isCredit) creditNoteCount += 1;
    else invoiceCount += 1;
  }

  // 2. Imported Simpla sales invoices from fin_invoices (source = 'simpla')
  for (const doc of simplaInvoices) {
    if (doc.source !== "simpla") continue;
    if (!doc.invoice_date?.startsWith(yearPrefix) || isExcludedStatus(doc.status)) continue;
    const idKey = invoiceIdentity(doc.number || doc.id);
    if (seenNumbers.has(idKey)) {
      deduplicatedCount += 1;
      continue;
    }
    seenNumbers.add(idKey);

    if (sourceFilter === "werkbonnen") continue;

    const isCredit = doc.doc_type === "creditnota";
    let docNet = 0;
    if (doc.lines.length > 0) {
      for (const line of doc.lines) {
        const rawAmount = Number(line.ex_vat ?? 0);
        if (!Number.isFinite(rawAmount)) continue;
        const signedAmount = isCredit ? -Math.abs(rawAmount) : rawAmount;
        const signedQty = isCredit ? -1 : 1;
        docNet += signedAmount;
        addLine(line.description, signedAmount, signedQty);
      }
    } else {
      addLine("", 0, isCredit ? -1 : 1);
    }

    simplaExVat += docNet;
    simplaDocCount += 1;
    if (!simplaMinDate || doc.invoice_date < simplaMinDate) simplaMinDate = doc.invoice_date;
    if (!simplaMaxDate || doc.invoice_date > simplaMaxDate) simplaMaxDate = doc.invoice_date;
    if (isCredit) creditNoteCount += 1;
    else invoiceCount += 1;
  }

  const metricValue = (b: AggBucket) => (metric === "revenue" ? b.amountExVat : b.quantity);
  const sorted = [...buckets.entries()]
    .map(([key, b]) => ({ key, ...b }))
    .filter((b) => Math.abs(metricValue(b)) > 0.001)
    .sort((a, b) => metricValue(b) - metricValue(a));

  const top = sorted.slice(0, maxCategories);
  const rest = sorted.slice(maxCategories);

  const rawSlices: Omit<BreakdownSlice, "sharePct">[] = top.map((b) => ({
    key: b.key,
    label: b.label,
    amountExVat: round2(b.amountExVat),
    quantity: round2(b.quantity),
  }));

  if (rest.length > 0) {
    rawSlices.push({
      key: "__other__",
      label: OTHER_LABEL,
      amountExVat: round2(rest.reduce((s, b) => s + b.amountExVat, 0)),
      quantity: round2(rest.reduce((s, b) => s + b.quantity, 0)),
      isOther: true,
    });
  }

  if (hasUnassigned && Math.abs(metricValue(unassigned)) > 0.001) {
    rawSlices.push({
      key: "__unassigned__",
      label: UNASSIGNED_LABEL,
      amountExVat: round2(unassigned.amountExVat),
      quantity: round2(unassigned.quantity),
      isUnassigned: true,
    });
  }

  const positiveTotal = rawSlices.reduce((s, item) => {
    const v = metric === "revenue" ? item.amountExVat : item.quantity;
    return s + Math.max(0, v);
  }, 0);

  const slices: BreakdownSlice[] = rawSlices.map((item) => {
    const v = metric === "revenue" ? item.amountExVat : item.quantity;
    const sharePct = positiveTotal > 0 && v > 0 ? round2((v / positiveTotal) * 100) : 0;
    return { ...item, sharePct };
  });

  const simplaIncomplete =
    sourceFilter !== "werkbonnen" &&
    (simplaDocCount === 0 || !simplaMaxDate || simplaMaxDate < `${year}-12-31`);

  return {
    year,
    sourceFilter,
    metric,
    totalExVat: round2(werkbonnenExVat + simplaExVat),
    werkbonnenExVat: round2(werkbonnenExVat),
    simplaExVat: round2(simplaExVat),
    invoiceCount,
    creditNoteCount,
    werkbonnenDocCount,
    simplaDocCount,
    deduplicatedCount,
    simplaMinDate,
    simplaMaxDate,
    simplaIncomplete,
    slices,
  };
}