import { describe, expect, it } from "vitest";
import { invoiceToEntry, isBalanced, openingEntry, parseAccountRows, paymentEntry, statements, trialBalance, vatReport } from "./boekhouding";

const post = (lines: any[], date = "2026-03-10", journal = "aankoop") => lines.map((l) => ({ ...l, entry_date: date, journal }));

describe("boekhouding", () => {
  it("aankoopfactuur is in evenwicht met btw en leverancier", () => {
    const { lines } = invoiceToEntry({ direction: "aankoop", doc_type: "factuur", lines: [{ account: "611120", ex_vat: 275, vat: 57.75 }] });
    expect(isBalanced(lines).ok).toBe(true);
    expect(lines.find((l) => l.account === "440000")?.credit).toBe(332.75);
    expect(lines.find((l) => l.account === "411000")?.vat_grid).toBe("59");
  });
  it("creditnota draait de boeking om", () => {
    const { lines } = invoiceToEntry({ direction: "aankoop", doc_type: "creditnota", lines: [{ account: "601000", ex_vat: 100, vat: 21 }] });
    expect(lines.find((l) => l.account === "601000")?.credit).toBe(100);
    expect(lines.find((l) => l.account === "440000")?.debit).toBe(121);
    expect(isBalanced(lines).ok).toBe(true);
  });
  it("lijn zonder rekening weigert", () => {
    expect(invoiceToEntry({ direction: "aankoop", doc_type: "factuur", lines: [{ account: null, ex_vat: 1, vat: 0 }] }).error).toBeTruthy();
  });
  it("verkoop + betaling, resultaat en balans sluiten", () => {
    const v = invoiceToEntry({ direction: "verkoop", doc_type: "factuur", lines: [{ account: "700000", ex_vat: 1000, vat: 210 }] }).lines;
    const a = invoiceToEntry({ direction: "aankoop", doc_type: "factuur", lines: [{ account: "613260", ex_vat: 400, vat: 84 }] }).lines;
    const p = paymentEntry(1210, "550000", "400000");
    const all = [...post(v, "2026-03-01", "verkoop"), ...post(a), ...post(p, "2026-03-20", "bank")];
    const st = statements(trialBalance(all));
    expect(st.resultaat).toBe(600);
    expect(st.sluit).toBe(true);
    const vat = vatReport(all, "2026-01-01", "2026-03-31");
    expect(vat.grids["03"]).toBe(1000);
    expect(vat.saldo).toBe(126);
  });
  it("resultaatrekeningen van vorige periodes tellen niet mee", () => {
    const a = post(invoiceToEntry({ direction: "aankoop", doc_type: "factuur", lines: [{ account: "613260", ex_vat: 400, vat: 0 }] }).lines, "2025-12-01");
    const tb = trialBalance(a, "2026-01-01");
    expect(tb.find((r) => r.account === "613260")).toBeUndefined();
    expect(tb.find((r) => r.account === "440000")?.saldo).toBe(-400);
  });
  it("balansimport en openingsboeking", () => {
    const rows = parseAccountRows([{ r: "550000", n: "Bank", s: "1.000,00" }, { r: "100000", n: "Kapitaal", s: "-1000" }, { r: "abc", n: "x", s: "1" }], { nr: "r", naam: "n", saldo: "s" });
    expect(rows[2]?.err).toBeTruthy();
    const o = openingEntry(rows);
    expect(o.diff).toBe(0);
    expect(o.lines).toHaveLength(2);
  });
});

describe("jaarafsluiting vorig jaar", () => {
  const close = [
    { account: "550200", debit: 1000, credit: 0, entry_date: "2025-12-31", journal: "divers", source: "jaarafsluiting" },
    { account: "700000", debit: 0, credit: 1000, entry_date: "2025-12-31", journal: "divers", source: "jaarafsluiting" },
  ];
  const open26 = [
    { account: "550200", debit: 1000, credit: 0, entry_date: "2026-01-01", journal: "opening" },
    { account: "140000", debit: 0, credit: 1000, entry_date: "2026-01-01", journal: "opening" },
  ];
  it("telt in 2025 mee", () => {
    const st = statements(trialBalance([...close, ...open26], "2025-01-01", "2025-12-31"));
    expect(st.opbrengsten).toBe(1000);
    expect(st.activa).toBe(1000);
  });
  it("mengt niet met 2026", () => {
    const st = statements(trialBalance([...close, ...open26], "2026-01-01", "2026-12-31"));
    expect(st.opbrengsten + 0).toBe(0);
    expect(st.activa).toBe(1000);
  });
});
