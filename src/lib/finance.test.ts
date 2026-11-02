import { describe, expect, it } from "vitest";
import { resolutionEvidence, validateInvestment, validateLoan, buildFinanceTasks, depreciationSchedule, loanSchedule, parseAmount, signedAmount, suggest, summarizeMonth, type Rule } from "./finance";

const base = { capitalizable_amount: 1000, start_date: "2026-01-20", useful_life_months: 3, residual_value: 0, opening_accumulated: 0, opening_cutoff: null, is_land: false, disposal_date: null };

describe("afschrijving", () => {
  it("lineair met afrondingscorrectie in laatste maand", () => {
    const s = depreciationSchedule(base);
    expect(s.map((r) => r.depreciation)).toEqual([333.33, 333.33, 333.34]);
    expect(s[0]?.month).toBe("2026-01-01");
    expect(s.at(-1)?.bookValue).toBe(0);
  });
  it("nooit onder restwaarde", () => {
    const s = depreciationSchedule({ ...base, residual_value: 100 });
    expect(s.at(-1)?.bookValue).toBe(100);
  });
  it("openingssaldo met cutoff verdeelt enkel het restant", () => {
    const s = depreciationSchedule({ ...base, useful_life_months: 10, opening_accumulated: 400, opening_cutoff: "2026-04-30" });
    expect(s.length).toBe(6);
    expect(s[0]?.month).toBe("2026-05-01");
    expect(s.at(-1)?.accumulated).toBe(1000);
  });
  it("grond en buitengebruikstelling", () => {
    expect(depreciationSchedule({ ...base, is_land: true })).toEqual([]);
    expect(depreciationSchedule({ ...base, disposal_date: "2026-02-10" }).length).toBe(2);
  });
  it("ontbrekende parameters geven geen schema", () => {
    expect(depreciationSchedule({ ...base, useful_life_months: null })).toEqual([]);
  });
});

describe("lening", () => {
  it("kapitaal + interest sluit exact", () => {
    const s = loanSchedule(10000, 3.6, 12, "2026-01-01");
    expect(s.at(-1)?.balance).toBe(0);
    expect(Math.round(s.reduce((a, b) => a + b.principal, 0) * 100) / 100).toBe(10000);
    expect(s[0]?.interest).toBe(30);
  });
});

describe("regels", () => {
  const rules: Rule[] = [
    { id: "1", supplier_key: "yappa", keyword: "cursus", account: "615600", category: "Cursussen", scope: "soortgelijk", hits: 2, enabled: true },
    { id: "2", supplier_key: "yappa", keyword: "advertentie", account: "615200", category: "Publiciteit", scope: "soortgelijk", hits: 1, enabled: true },
  ];
  it("gemengde leverancier: classificeert op omschrijving", () => {
    expect(suggest(rules, "Yappa BV", "Cursus VCA")?.account).toBe("615600");
    expect(suggest(rules, "Yappa", "Advertentie juni")?.account).toBe("615200");
  });
  it("dubbelzinnig zonder trefwoord -> geen voorstel", () => {
    expect(suggest(rules, "Yappa", "Diverse")).toBeNull();
  });
});

describe("maandoverzicht", () => {
  it("onbekend blijft null, geen nul", () => {
    const s = summarizeMonth("2026-03-01", [], []);
    expect(s.revenue).toBeNull();
    expect(s.profit).toBeNull();
  });
  it("handmatig totaal sluit facturen van dezelfde categorie uit; creditnota keert kost om", () => {
    const s = summarizeMonth(
      "2026-03-01",
      [{ month: "2026-03-01", kind: "kost", category: "Huur", amount: 275, level: "totaal" }, { month: "2026-03-01", kind: "omzet", category: "x", amount: 1000, level: "totaal" }],
      [
        { month: "2026-03-01", direction: "aankoop", doc_type: "factuur", category: "Huur", ex_vat: 275, approved: true },
        { month: "2026-03-01", direction: "aankoop", doc_type: "factuur", category: "GSM", ex_vat: 50, approved: true },
        { month: "2026-03-01", direction: "aankoop", doc_type: "creditnota", category: "GSM", ex_vat: 20, approved: true },
        { month: "2026-03-01", direction: "aankoop", doc_type: "factuur", category: "GSM", ex_vat: 99, approved: false },
      ],
    );
    expect(s.costs).toBe(305);
    expect(s.excludedInvoiceLines).toBe(1);
    expect(s.unapprovedLines).toBe(1);
    expect(s.profit).toBe(695);
  });
  it("debet/credit en bedragnotatie", () => {
    expect(signedAmount("kost", 100, 20, null)).toBe(80);
    expect(signedAmount("omzet", 0, 500, null)).toBe(500);
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("")).toBeNull();
  });
});

describe("financetaken", () => {
  it("stabiele sleutels: zelfde input geeft identieke sleutels (dedupe)", () => {
    const input = {
      companyName: "Riory BV", today: "2026-10-05", simpla: { bound: true, lastSuccess: "2026-10-05T06:00:00Z" },
      invoices: [{ id: "a", direction: "aankoop", number: "F1", counterparty: "X", due_date: "2026-09-01", status: "open", review_status: "te_beoordelen", total: 100 }],
      investments: [{ ...base, id: "i", name: "Camera", useful_life_months: null }],
      budgets: [{ category: "GSM", month: "2026-09-01", amount: 50 }], actualByCat: { "2026-09-01|GSM": 80 },
      months: [],
    };
    const a = buildFinanceTasks(input).map((t) => t.key);
    expect(a).toEqual(buildFinanceTasks(input).map((t) => t.key));
    expect(new Set(a).size).toBe(a.length);
    expect(a).toContain("bill-overdue:a");
    expect(a).toContain("month-incomplete:2026-09-01");
  });
});

const taskBase = () => ({
  companyName: "Riory BV", today: "2026-10-05", simpla: { bound: true, lastSuccess: "2026-09-01T06:00:00Z" },
  invoices: [{ id: "a", direction: "aankoop", number: "F1", counterparty: "X", due_date: "2026-09-01", status: "open", review_status: "goedgekeurd", total: 100 }],
  investments: [], budgets: [], actualByCat: {}, months: [{ month: "2026-09-01", complete: true }, { month: "2026-10-01", complete: true }],
});

describe("geen dubbele taken over meerdere dagen", () => {
  it("verouderde Simpla-sync: zelfde sleutel op dag 1, 2 en 3", () => {
    const keys = ["2026-10-05", "2026-10-06", "2026-10-07"].map((d) => buildFinanceTasks({ ...taskBase(), today: d }).find((t) => t.key.startsWith("sync-stale"))?.key);
    expect(new Set(keys).size).toBe(1);
  });
  it("vervallen factuur: zelfde sleutel op opeenvolgende dagen", () => {
    const a = buildFinanceTasks({ ...taskBase(), today: "2026-10-05" }).map((t) => t.key);
    const b = buildFinanceTasks({ ...taskBase(), today: "2026-10-09" }).map((t) => t.key);
    expect(a).toContain("bill-overdue:a");
    expect(b).toContain("bill-overdue:a");
  });
  it("geen Simpla-taak voor bedrijf zonder Simpla-koppeling", () => {
    expect(buildFinanceTasks({ ...taskBase(), simpla: { bound: false, lastSuccess: null } }).some((t) => t.key.startsWith("sync-stale"))).toBe(false);
  });
});

describe("automatisch afsluiten vereist bewijs", () => {
  const inv = (o: object) => new Map([["a", { id: "a", direction: "aankoop", number: "F1", counterparty: "X", due_date: "2026-09-01", status: "open", review_status: "te_beoordelen", total: 1, ...o }]]);
  it("verdwenen/verwijderd of leesfout (lege bron) sluit niet", () => {
    expect(resolutionEvidence("bill-overdue:a", { invoices: new Map(), investments: new Map() })).toBeNull();
    expect(resolutionEvidence("inv-review:a", { invoices: new Map(), investments: new Map() })).toBeNull();
  });
  it("betwist of betaald zonder bewijs sluit niet", () => {
    expect(resolutionEvidence("bill-overdue:a", { invoices: inv({ status: "betwist" }), investments: new Map() })).toBeNull();
    expect(resolutionEvidence("bill-overdue:a", { invoices: inv({ status: "betaald" }), investments: new Map() })).toBeNull();
  });
  it("betaald met bankreferentie / goedgekeurd sluit wel", () => {
    expect(resolutionEvidence("bill-overdue:a", { invoices: inv({ status: "betaald", bank_ref: "B1" }), investments: new Map() })).toContain("B1");
    expect(resolutionEvidence("inv-review:a", { invoices: inv({ review_status: "goedgekeurd" }), investments: new Map() })).not.toBeNull();
  });
  it("budget- en maandtaken worden nooit automatisch gesloten", () => {
    expect(resolutionEvidence("budget:2026-09-01:GSM", { invoices: new Map(), investments: new Map() })).toBeNull();
    expect(resolutionEvidence("month-incomplete:2026-09-01", { invoices: new Map(), investments: new Map() })).toBeNull();
  });
});

describe("validatie", () => {
  it("ongeldige investeringen geven fouten en geen schema", () => {
    for (const bad of [{ useful_life_months: 0 }, { useful_life_months: 2.5 }, { residual_value: 2000 }, { residual_value: -1 }, { opening_accumulated: 1200 }, { opening_accumulated: 100, opening_cutoff: null }, { start_date: "niet-een-datum" }, { disposal_date: "2025-01-01" }]) {
      const i = { ...base, ...bad };
      expect(validateInvestment(i).length).toBeGreaterThan(0);
      expect(depreciationSchedule(i)).toEqual([]);
    }
    expect(validateInvestment(base)).toEqual([]);
  });
  it("leningen", () => {
    expect(validateLoan(0, 3, 12).length).toBe(1);
    expect(validateLoan(1000, -1, 12).length).toBe(1);
    expect(validateLoan(1000, 3, 0).length).toBe(1);
    expect(validateLoan(1000, 3, 12)).toEqual([]);
  });
});

describe("winst en kassaldo", () => {
  const m = "2026-03-01";
  it("investeringslijn is geen bedrijfskost", () => {
    const s = summarizeMonth(m, [{ month: m, kind: "omzet", category: "o", amount: 1000, level: "totaal" }], [{ month: m, direction: "aankoop", doc_type: "factuur", category: "Machines", ex_vat: 5000, approved: true, is_investment: true }]);
    expect(s.costs).toBeNull();
    expect(s.investmentLines).toBe(1);
  });
  it("geboekte afschrijving/interest uit boekhouding: berekende waarden niet bovenop", () => {
    const E = [
      { month: m, kind: "omzet" as const, category: "o", amount: 1000, level: "totaal" as const },
      { month: m, kind: "kost" as const, category: "Afschrijving", account: "630200", amount: 100, level: "detail" as const },
      { month: m, kind: "kost" as const, category: "Interest", account: "650000", amount: 20, level: "detail" as const },
    ];
    const s = summarizeMonth(m, E, [], { depreciation: 333, interest: 50 });
    expect(s.profit).toBe(880);
    const s2 = summarizeMonth(m, [...E.slice(0, 1), { month: m, kind: "kost", category: "Huur", account: "611120", amount: 275, level: "totaal" }], [], { depreciation: 333, interest: 50 });
    expect(s2.profit).toBe(342);
    // kosten onbekend => resultaat onbekend, ook met berekende afschrijving
    expect(summarizeMonth(m, E.slice(0, 1), [], { depreciation: 333, interest: 50 }).profit).toBeNull();
  });
  it("kassaldo is momentopname: laatste stand per rekening, niet de som van standen", () => {
    const s = summarizeMonth(m, [
      { month: m, kind: "kas", category: "KBC", amount: 1000, level: "totaal", created_at: "2026-03-10" },
      { month: m, kind: "kas", category: "KBC", amount: 1500, level: "totaal", created_at: "2026-03-31" },
      { month: m, kind: "kas", category: "Belfius", amount: 200, level: "totaal", created_at: "2026-03-31" },
    ], []);
    expect(s.cash).toBe(1700);
  });
});

import { depreciationByYear } from "./finance";
describe("depreciationByYear", () => {
  it("groepeert maanden per jaar met begin- en eindboekwaarde", () => {
    const rows = [
      { month: "2025-11-01", depreciation: 100, accumulated: 100, bookValue: 1100 },
      { month: "2025-12-01", depreciation: 100, accumulated: 200, bookValue: 1000 },
      { month: "2026-01-01", depreciation: 100, accumulated: 300, bookValue: 900 },
    ];
    expect(depreciationByYear(rows)).toEqual([
      { year: 2025, months: 2, begin: 1200, depreciation: 200, accumulated: 200, end: 1000 },
      { year: 2026, months: 1, begin: 1000, depreciation: 100, accumulated: 300, end: 900 },
    ]);
  });
});
