import { describe, expect, it } from "vitest";
import {
  buildAnnualRevenueSummary,
  categorizeLineLabel,
  resolveHeroPeriod,
  OTHER_LABEL,
  UNASSIGNED_LABEL,
  type AppInvoiceInput,
  type CustomerLookupInput,
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

  it("ranks top customers by net revenue ex VAT, subtracts credit notes, deduplicates Simpla, and preserves distinct legal entities", () => {
    const customers: CustomerLookupInput[] = [
      { id: "c-kozl", name: "KOZL vzw", vat_number: "BE0410556656", street: "Kruissteenweg", house_number: "17", postal_code: "3700", city: "Tongeren" },
      { id: "c-dds", name: "Immo DDS", vat_number: "BE0450686051", street: "Chemin du vieux thier", house_number: "2", postal_code: "4190", city: "Fetrières" },
      { id: "c-peeters-1", name: "Jan Peeters", street: "Kerkstraat", house_number: "1", postal_code: "3740", city: "Bilzen" },
      { id: "c-peeters-2", name: "Jan Peeters", street: "Markt", house_number: "9", postal_code: "3500", city: "Hasselt" },
    ];

    const invoices: AppInvoiceInput[] = [
      {
        id: "i1",
        number: "20260901",
        issue_date: "2026-11-05",
        kind: "factuur",
        status: "verzonden",
        net: 500,
        lines: [{ description: "Interventie", quantity: 1, amount: 500 }],
        resolved_customer_id: "c-kozl",
        customer: { name: "KOZL vzw", vatNumber: "BE0410556656" },
      },
      {
        id: "i2",
        number: "20260902",
        issue_date: "2026-11-06",
        kind: "creditnota",
        status: "verzonden",
        net: -100,
        lines: [{ description: "Correctie", quantity: 1, amount: 100 }],
        customer: { name: "KOZL vzw", vatNumber: "BE 0410.556.656" }, // matched via VAT to same c-kozl
      },
      {
        id: "i3",
        number: "20260903",
        issue_date: "2026-11-07",
        kind: "factuur",
        status: "concept", // excluded
        net: 9999,
        lines: [{ description: "Concept", quantity: 1, amount: 9999 }],
        resolved_customer_id: "c-dds",
      },
      {
        id: "i4",
        number: "20260904",
        issue_date: "2026-11-08",
        kind: "factuur",
        status: "betaald",
        net: 200,
        lines: [{ description: "Interventie", quantity: 1, amount: 200 }],
        customer: { name: "Jan Peeters", street: "Kerkstraat", houseNumber: "1", postalCode: "3740", city: "Bilzen" },
      },
      {
        id: "i5",
        number: "20260905",
        issue_date: "2026-11-09",
        kind: "factuur",
        status: "betaald",
        net: 150,
        lines: [{ description: "Interventie", quantity: 1, amount: 150 }],
        customer: { name: "Jan Peeters", street: "Markt", houseNumber: "9", postalCode: "3500", city: "Hasselt" },
      },
      {
        id: "i6",
        number: "20260906",
        issue_date: "2026-11-10",
        kind: "factuur",
        status: "verzonden",
        net: 50,
        lines: [{ description: "Losse bon", quantity: 1, amount: 50 }],
        customer: null, // Niet toegewezen
      },
    ];

    const simpla: SimplaInvoiceInput[] = [
      {
        id: "s-dup",
        number: "20260901", // Duplicate of i1 -> skipped
        invoice_date: "2026-11-05",
        doc_type: "factuur",
        status: "betaald",
        source: "simpla",
        counterparty: "KOZL vzw",
        lines: [{ description: "Interventie", ex_vat: 500 }],
      },
      {
        id: "s-dds",
        number: "20260800",
        invoice_date: "2026-11-04",
        doc_type: "factuur",
        status: "betaald",
        source: "simpla",
        counterparty: "Immo DDS",
        lines: [{ description: "Interventie", ex_vat: 300 }],
      },
      {
        id: "s-neg",
        number: "20260801",
        invoice_date: "2026-11-11",
        doc_type: "creditnota",
        status: "open",
        source: "simpla",
        counterparty: "Negatieve Klant BV",
        lines: [{ description: "Credit", ex_vat: 80 }],
      },
    ];

    const res = buildAnnualRevenueSummary({
      year: 2026,
      from: "2026-11-01",
      to: "2026-11-24",
      sourceFilter: "all",
      metric: "revenue",
      appInvoices: invoices,
      simplaInvoices: simpla,
      customers,
      maxCustomers: 3,
    });

    // Positive customers: KOZL (400), Immo DDS (300), Jan Peeters Bilzen (200), Overige = Jan Peeters Hasselt (150), Niet toegewezen (50)
    // Total positive = 1100; negative customer kept separate (-80)
    expect(res.customerSlices.map((c) => [c.label, c.customerId, c.amountExVat])).toEqual([
      ["KOZL vzw", "c-kozl", 400],
      ["Immo DDS", "c-dds", 300],
      ["Jan Peeters", "c-peeters-1", 200],
      [OTHER_LABEL, null, 150],
      [UNASSIGNED_LABEL, null, 50],
    ]);
    expect(res.negativeCustomerAdjustments.map((c) => [c.label, c.amountExVat])).toEqual([
      ["Negatieve Klant BV", -80],
    ]);

    // Source filter "werkbonnen" excludes Immo DDS and Negatieve Klant BV
    const onlyApp = buildAnnualRevenueSummary({
      year: 2026,
      from: "2026-11-01",
      to: "2026-11-24",
      sourceFilter: "werkbonnen",
      metric: "revenue",
      appInvoices: invoices,
      simplaInvoices: simpla,
      customers,
      maxCustomers: 6,
    });
    expect(onlyApp.customerSlices.map((c) => [c.label, c.customerId, c.amountExVat])).toEqual([
      ["KOZL vzw", "c-kozl", 400],
      ["Jan Peeters", "c-peeters-1", 200],
      ["Jan Peeters", "c-peeters-2", 150],
      [UNASSIGNED_LABEL, null, 50],
    ]);
    expect(onlyApp.negativeCustomerAdjustments).toEqual([]);
  });
});