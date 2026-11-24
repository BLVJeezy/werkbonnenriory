import { invoiceIdentity } from "./product-sales";

export type RevenueSourceFilter = "all" | "werkbonnen" | "simpla";
export type BreakdownMetric = "revenue" | "count";
export type HeroPeriodMode = "month" | "year";

const DUTCH_MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
] as const;

export type HeroPeriodRange = {
  mode: HeroPeriodMode;
  year: number;
  from: string;
  to: string;
  title: string;
  periodLabel: string;
  shortPeriodLabel: string;
};

const fmtBE = (iso: string) => iso.split("-").reverse().join("/");

/** Pure: resolves exact Brussels calendar month or YTD/full-year bounds from `currentDay` (YYYY-MM-DD). */
export function resolveHeroPeriod(
  mode: HeroPeriodMode,
  currentDay: string,
  selectedYear?: number,
): HeroPeriodRange {
  const currentYear = Number(currentDay.slice(0, 4)) || 2026;
  const currentMonth = Number(currentDay.slice(5, 7)) || 1;

  if (mode === "month") {
    const mm = String(currentMonth).padStart(2, "0");
    const from = `${currentYear}-${mm}-01`;
    const to = currentDay;
    const monthName = DUTCH_MONTHS[currentMonth - 1] ?? "";
    const monthYear = `${monthName} ${currentYear}`;
    return {
      mode: "month",
      year: currentYear,
      from,
      to,
      title: "Omzet deze maand",
      periodLabel: `${monthYear} (${fmtBE(from)} – ${fmtBE(to)})`,
      shortPeriodLabel: monthYear,
    };
  }

  const year = selectedYear ?? currentYear;
  const from = `${year}-01-01`;
  const to = year === currentYear ? currentDay : `${year}-12-31`;
  return {
    mode: "year",
    year,
    from,
    to,
    title: year === currentYear ? "Omzet dit jaar" : `Jaaromzet ${year}`,
    periodLabel: `${fmtBE(from)} – ${fmtBE(to)}`,
    shortPeriodLabel: year === currentYear ? `${year} (t/m ${fmtBE(to)})` : String(year),
  };
}

export type AppInvoiceInput = {
  id: string;
  number: string;
  issue_date: string;
  kind: string;
  status: string;
  net: number;
  lines: unknown;
  work_order_id?: string | null;
  resolved_customer_id?: string | null;
  customer?: {
    id?: string | null;
    name?: string | null;
    vatNumber?: string | null;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
  } | null;
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
  counterparty?: string | null;
  lines: SimplaInvoiceLineInput[];
};

export type CustomerLookupInput = {
  id: string;
  name: string;
  vat_number?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
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

export type CustomerRevenueSlice = {
  key: string;
  customerId: string | null;
  label: string;
  amountExVat: number;
  invoiceCount: number;
  creditNoteCount: number;
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
  customerSlices: CustomerRevenueSlice[];
  negativeCustomerAdjustments: CustomerRevenueSlice[];
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

const normVat = (v: string | null | undefined) => {
  const cleaned = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length >= 8 ? cleaned : "";
};

const normAddressKey = (parts: Array<string | null | undefined>) =>
  parts.map((p) => normText(String(p ?? ""))).filter(Boolean).join("|");

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
type CustomerAggBucket = {
  customerId: string | null;
  label: string;
  amountExVat: number;
  invoiceCount: number;
  creditNoteCount: number;
};

export function buildAnnualRevenueSummary(params: {
  year: number;
  from?: string;
  to?: string;
  sourceFilter: RevenueSourceFilter;
  metric: BreakdownMetric;
  appInvoices: AppInvoiceInput[];
  simplaInvoices: SimplaInvoiceInput[];
  customers?: CustomerLookupInput[];
  maxCategories?: number;
  maxCustomers?: number;
  todayIso?: string;
}): AnnualRevenueSummary {
  const {
    year,
    sourceFilter,
    metric,
    appInvoices,
    simplaInvoices,
    customers = [],
    maxCategories = 6,
    maxCustomers = 6,
  } = params;
  const from = params.from ?? `${year}-01-01`;
  const to = params.to ?? `${year}-12-31`;
  const inRange = (d: string | null | undefined) => !!d && d >= from && d <= to;
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

  // Build deterministic customer lookup tables so distinct legal entities are never merged
  const customerById = new Map<string, CustomerLookupInput>();
  const customersByVat = new Map<string, CustomerLookupInput[]>();
  const customersByName = new Map<string, CustomerLookupInput[]>();
  const customersByNameAddr = new Map<string, CustomerLookupInput[]>();
  for (const c of customers) {
    customerById.set(c.id, c);
    const vat = normVat(c.vat_number);
    if (vat) {
      const list = customersByVat.get(vat) ?? [];
      list.push(c);
      customersByVat.set(vat, list);
    }
    const nameKey = normText(c.name);
    if (nameKey) {
      const list = customersByName.get(nameKey) ?? [];
      list.push(c);
      customersByName.set(nameKey, list);
      const addr = normAddressKey([c.street, c.house_number, c.postal_code, c.city]);
      if (addr) {
        const naKey = `${nameKey}::${addr}`;
        const naList = customersByNameAddr.get(naKey) ?? [];
        naList.push(c);
        customersByNameAddr.set(naKey, naList);
      }
    }
  }

  const customerBuckets = new Map<string, CustomerAggBucket>();
  const unassignedCustomer: CustomerAggBucket = {
    customerId: null,
    label: UNASSIGNED_LABEL,
    amountExVat: 0,
    invoiceCount: 0,
    creditNoteCount: 0,
  };
  let hasUnassignedCustomer = false;

  const resolveCustomerIdentity = (input: {
    explicitId?: string | null;
    name?: string | null;
    vatNumber?: string | null;
    street?: string | null;
    houseNumber?: string | null;
    postalCode?: string | null;
    city?: string | null;
  }): { key: string; customerId: string | null; label: string; isUnassigned?: boolean } => {
    const explicitId = input.explicitId?.trim() || "";
    if (explicitId) {
      const matched = customerById.get(explicitId);
      const label = matched?.name?.trim() || input.name?.trim() || UNASSIGNED_LABEL;
      return { key: `id:${explicitId}`, customerId: explicitId, label };
    }

    const vat = normVat(input.vatNumber);
    if (vat) {
      const byVat = customersByVat.get(vat);
      if (byVat && byVat.length === 1 && byVat[0]) {
        return { key: `id:${byVat[0].id}`, customerId: byVat[0].id, label: byVat[0].name.trim() };
      }
      const label = input.name?.trim() || vat;
      return { key: `vat:${vat}`, customerId: null, label };
    }

    const rawName = input.name?.trim() || "";
    const nameKey = normText(rawName);
    if (!nameKey) {
      return { key: "__unassigned__", customerId: null, label: UNASSIGNED_LABEL, isUnassigned: true };
    }

    const addr = normAddressKey([input.street, input.houseNumber, input.postalCode, input.city]);
    if (addr) {
      const byNameAddr = customersByNameAddr.get(`${nameKey}::${addr}`);
      if (byNameAddr && byNameAddr.length === 1 && byNameAddr[0]) {
        return { key: `id:${byNameAddr[0].id}`, customerId: byNameAddr[0].id, label: byNameAddr[0].name.trim() };
      }
    }

    const byName = customersByName.get(nameKey);
    if (byName && byName.length === 1 && byName[0]) {
      return { key: `id:${byName[0].id}`, customerId: byName[0].id, label: byName[0].name.trim() };
    }

    // Distinct legal entities with the same name but different addresses stay separated
    const fallbackKey = addr ? `name:${nameKey}::${addr}` : `name:${nameKey}`;
    return { key: fallbackKey, customerId: null, label: rawName };
  };

  const addCustomerDoc = (
    identity: { key: string; customerId: string | null; label: string; isUnassigned?: boolean },
    amount: number,
    isCredit: boolean,
  ) => {
    if (identity.isUnassigned) {
      unassignedCustomer.amountExVat += amount;
      if (isCredit) unassignedCustomer.creditNoteCount += 1;
      else unassignedCustomer.invoiceCount += 1;
      hasUnassignedCustomer = true;
      return;
    }
    const prev = customerBuckets.get(identity.key);
    if (prev) {
      prev.amountExVat += amount;
      if (isCredit) prev.creditNoteCount += 1;
      else prev.invoiceCount += 1;
    } else {
      customerBuckets.set(identity.key, {
        customerId: identity.customerId,
        label: identity.label,
        amountExVat: amount,
        invoiceCount: isCredit ? 0 : 1,
        creditNoteCount: isCredit ? 1 : 0,
      });
    }
  };

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
    if (!inRange(doc.issue_date) || isExcludedStatus(doc.status)) continue;
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

    const custIdentity = resolveCustomerIdentity({
      explicitId: doc.resolved_customer_id ?? doc.customer?.id ?? null,
      name: doc.customer?.name ?? null,
      vatNumber: doc.customer?.vatNumber ?? null,
      street: doc.customer?.street ?? null,
      houseNumber: doc.customer?.houseNumber ?? null,
      postalCode: doc.customer?.postalCode ?? null,
      city: doc.customer?.city ?? null,
    });
    addCustomerDoc(custIdentity, docNet, isCredit);
  }

  // 2. Imported Simpla sales invoices from fin_invoices (source = 'simpla')
  for (const doc of simplaInvoices) {
    if (doc.source !== "simpla") continue;
    if (!inRange(doc.invoice_date) || isExcludedStatus(doc.status)) continue;
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

    const simplaIdentity = resolveCustomerIdentity({
      name: doc.counterparty ?? null,
    });
    addCustomerDoc(simplaIdentity, docNet, isCredit);
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

  // Build customer revenue slices: positive ranked top N + Overige + Niet toegewezen; negative corrections kept separate
  const allCustomerEntries = [...customerBuckets.entries()].map(([key, b]) => ({
    key,
    customerId: b.customerId,
    label: b.label,
    amountExVat: round2(b.amountExVat),
    invoiceCount: b.invoiceCount,
    creditNoteCount: b.creditNoteCount,
  }));

  const positiveCustomers = allCustomerEntries
    .filter((c) => c.amountExVat > 0.005)
    .sort((a, b) => b.amountExVat - a.amountExVat);

  const negativeCustomerAdjustments: CustomerRevenueSlice[] = allCustomerEntries
    .filter((c) => c.amountExVat < -0.005)
    .sort((a, b) => a.amountExVat - b.amountExVat)
    .map((c) => ({ ...c, sharePct: 0 }));

  const topCustomers = positiveCustomers.slice(0, maxCustomers);
  const restCustomers = positiveCustomers.slice(maxCustomers);

  const rawCustomerSlices: Omit<CustomerRevenueSlice, "sharePct">[] = topCustomers.map((c) => ({ ...c }));
  if (restCustomers.length > 0) {
    rawCustomerSlices.push({
      key: "__other_customers__",
      customerId: null,
      label: OTHER_LABEL,
      amountExVat: round2(restCustomers.reduce((s, c) => s + c.amountExVat, 0)),
      invoiceCount: restCustomers.reduce((s, c) => s + c.invoiceCount, 0),
      creditNoteCount: restCustomers.reduce((s, c) => s + c.creditNoteCount, 0),
      isOther: true,
    });
  }
  if (hasUnassignedCustomer) {
    const unassignedAmt = round2(unassignedCustomer.amountExVat);
    if (unassignedAmt > 0.005) {
      rawCustomerSlices.push({
        key: "__unassigned_customer__",
        customerId: null,
        label: UNASSIGNED_LABEL,
        amountExVat: unassignedAmt,
        invoiceCount: unassignedCustomer.invoiceCount,
        creditNoteCount: unassignedCustomer.creditNoteCount,
        isUnassigned: true,
      });
    } else if (unassignedAmt < -0.005) {
      negativeCustomerAdjustments.push({
        key: "__unassigned_customer__",
        customerId: null,
        label: UNASSIGNED_LABEL,
        amountExVat: unassignedAmt,
        invoiceCount: unassignedCustomer.invoiceCount,
        creditNoteCount: unassignedCustomer.creditNoteCount,
        sharePct: 0,
        isUnassigned: true,
      });
    }
  }

  const positiveCustomerTotal = rawCustomerSlices.reduce((s, c) => s + Math.max(0, c.amountExVat), 0);
  const customerSlices: CustomerRevenueSlice[] = rawCustomerSlices.map((item) => ({
    ...item,
    sharePct: positiveCustomerTotal > 0 && item.amountExVat > 0 ? round2((item.amountExVat / positiveCustomerTotal) * 100) : 0,
  }));

  const simplaIncomplete =
    sourceFilter !== "werkbonnen" &&
    (simplaDocCount === 0 || !simplaMaxDate || simplaMaxDate < to);

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
    customerSlices,
    negativeCustomerAdjustments,
  };
}