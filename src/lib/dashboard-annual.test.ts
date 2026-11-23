import { describe, expect, it } from "vitest";
import {
  buildAnnualRevenueSummary,
  categorizeLineLabel,
  resolveHeroPeriod,
  OTHER_LABEL,
  UNASSIGNED_LABEL,
  type AppInvoiceInput,
  type SimplaInvoiceInput,
} from "./dashboard-annual";

const appSample: AppInvoiceInput[] = [
  {
    id: "a1",
    number: "20260901",
    issue_date: "2026-06-15",
    kind: "factuur",
    status: "verzonden",
    net: 300,
    lines: [
      { description: "Camera-inspectie 75-110", quantity: 1, unitPrice: 125, amount: 125 },
      { description: "Verplaatsing (km heen en terug)", quantity: 10, unitPrice: 17.5, amount: 175 },
    ],
  },
  {
    id: "a2",
    number: "20260902",
    issue_date: "2026-07-01",
    kind: "creditnota",
    status: "betaald",
    net: -50,
    lines: [{ description: "Camera-inspectie 75-110", quantity: 1, unitPrice: 50, amount: 50 }],
  },
  {
    id: "a3",
    number: "20260903",
    issue_date: "2026-08-01",
    kind: "factuur",
    status: "concept",
    net: 999,
    lines: [{ description: "Conceptregel", quantity: 1, unitPrice: 999, amount: 999 }],
  },
  {
    id: "a4",
    number: "20250101",
    issue_date: "2025-11-10",
    kind: "factuur",
    status: "verzonden",
    net: 400,
    lines: [{ description: "Ledigen septische put", quantity: 1, unitPrice: 400, amount: 400 }],
  },
];

const simplaSample: SimplaInvoiceInput[] = [
  {
    id: "s1",
    number: "20260901", // Duplicate of app invoice a1 -> must be deduplicated
    invoice_date: "2026-06-15",
    doc_type: "factuur",
    status: "betaald",
    source: "simpla",
    lines: [{ description: "Camera-inspectie 75-110", ex_vat: 300 }],
  },
  {
    id: "s2",
    number: "20260100",
    invoice_date: "2026-02-10",
    doc_type: "factuur",
    status: "betaald",
    source: "simpla",
    lines: [
      { description: "interventie/Ontstopping dagtarief", ex_vat: 500 },
      { description: "", ex_vat: 100 },
    ],
  },
  {
    id: "s3",
    number: "20260101",
    invoice_date: "2026-03-01",
    doc_type: "creditnota",
    status: "open",
    source: "simpla",
    lines: [{ description: "interventie/Ontstopping dagtarief", ex_vat: 100 }], // positive in fin_invoice_lines -> negated
  },
];

describe("buildAnnualRevenueSummary", () => {
  it("filters by year, excludes concepts, deduplicates Simpla against app, and subtracts credit notes", () => {
    const res = buildAnnualRevenueSummary({
      year: 2026,
      sourceFilter: "all",
      metric: "revenue",
      appInvoices: appSample,
      simplaInvoices: simplaSample,
    });

    // App: 300 - 50 = 250 (concept 999 excluded, 2025 excluded)
    // Simpla: 20260901 skipped (duplicate), +600 - 100 = 500
    expect(res.werkbonnenExVat).toBe(250);
    expect(res.simplaExVat).toBe(500);
    expect(res.totalExVat).toBe(750);
    expect(res.deduplicatedCount).toBe(1);
    expect(res.invoiceCount).toBe(2);
    expect(res.creditNoteCount).toBe(2);
    expect(res.simplaIncomplete).toBe(true);
  });

  it("supports source filtering for werkbonnen and simpla separately", () => {
    const onlyApp = buildAnnualRevenueSummary({
      year: 2026,
      sourceFilter: "werkbonnen",
      metric: "revenue",
      appInvoices: appSample,
      simplaInvoices: simplaSample,
    });
    expect(onlyApp.totalExVat).toBe(250);
    expect(onlyApp.simplaDocCount).toBe(0);
    expect(onlyApp.simplaIncomplete).toBe(false);

    const onlySimpla = buildAnnualRevenueSummary({
      year: 2026,
      sourceFilter: "simpla",
      metric: "revenue",
      appInvoices: appSample,
      simplaInvoices: simplaSample,
    });
    // 20260901 still deduplicated because it exists in Werkbonnenriory
    expect(onlySimpla.totalExVat).toBe(500);
    expect(onlySimpla.werkbonnenDocCount).toBe(0);
  });

  it("keeps unnamed lines as Niet toegewezen and groups overflow into Overige with accurate percentages", () => {
    const manyApp: AppInvoiceInput[] = [
      {
        id: "m1",
        number: "20261001",
        issue_date: "2026-04-01",
        kind: "factuur",
        status: "verzonden",
        net: 1000,
        lines: [
          { description: "Product A", quantity: 2, amount: 400 },
          { description: "Product B", quantity: 1, amount: 300 },
          { description: "Product C", quantity: 1, amount: 150 },
          { description: "Product D", quantity: 1, amount: 50 },
          { description: "", quantity: 1, amount: 100 },
        ],
      },
    ];

    const res = buildAnnualRevenueSummary({
      year: 2026,
      sourceFilter: "werkbonnen",
      metric: "revenue",
      appInvoices: manyApp,
      simplaInvoices: [],
      maxCategories: 2,
    });

    expect(res.slices.map((s) => s.label)).toEqual(["Product A", "Product B", OTHER_LABEL, UNASSIGNED_LABEL]);
    expect(res.slices.map((s) => s.amountExVat)).toEqual([400, 300, 200, 100]);
    expect(res.slices.map((s) => s.sharePct)).toEqual([40, 30, 20, 10]);
  });

  it("normalizes Riory activity and product labels consistently", () => {
    expect(categorizeLineLabel("Arbeid – Technische interventie – riooltechnieken (dag) (werkbon #159)")).toBe(
      "Interventie / ontstopping (dagtarief)",
    );
    expect(categorizeLineLabel("interventie/Ontstopping dagtarief")).toBe(
      "Interventie / ontstopping (dagtarief)",
    );
    expect(categorizeLineLabel("")).toBe(UNASSIGNED_LABEL);
  });

  it("resolves month and year periods dynamically around month/year boundaries and syncs KPI + slices", () => {
    const nov = resolveHeroPeriod("month", "2026-11-23");
    expect(nov.title).toBe("Omzet deze maand");
    expect(nov.from).toBe("2026-11-01");
    expect(nov.to).toBe("2026-11-23");
    expect(nov.shortPeriodLabel).toBe("november 2026");

    const jan1 = resolveHeroPeriod("month", "2027-01-01");
    expect(jan1.from).toBe("2027-01-01");
    expect(jan1.to).toBe("2027-01-01");
    expect(jan1.shortPeriodLabel).toBe("januari 2027");

    const ytd = resolveHeroPeriod("year", "2026-11-23", 2026);
    expect(ytd.title).toBe("Omzet dit jaar");
    expect(ytd.from).toBe("2026-01-01");
    expect(ytd.to).toBe("2026-11-23");

    // Empty month returns 0 and no slices without errors
    const emptyMonth = buildAnnualRevenueSummary({
      year: nov.year,
      from: nov.from,
      to: nov.to,
      sourceFilter: "all",
      metric: "revenue",
      appInvoices: appSample,
      simplaInvoices: simplaSample,
    });
    expect(emptyMonth.totalExVat).toBe(0);
    expect(emptyMonth.slices).toEqual([]);
    expect(emptyMonth.simplaIncomplete).toBe(true);

    // June month includes only June invoice (a1 = 300), excludes July credit note (a2) and Feb Simpla (s2)
    const june = resolveHeroPeriod("month", "2026-06-30");
    const juneRes = buildAnnualRevenueSummary({
      year: june.year,
      from: june.from,
      to: june.to,
      sourceFilter: "all",
      metric: "revenue",
      appInvoices: appSample,
      simplaInvoices: simplaSample,
    });
    expect(juneRes.totalExVat).toBe(300);
    expect(juneRes.slices.reduce((s, x) => s + x.amountExVat, 0)).toBe(300);
  });
});