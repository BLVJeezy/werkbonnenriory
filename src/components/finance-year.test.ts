import { describe, expect, it } from "vitest";
import { journalMonthRows, yearRows } from "./FinanceYear";
import { statements, trialBalance } from "@/lib/boekhouding";
describe("dashboard resultaat = balans resultaat", () => {
  it("som van maanden gelijk aan balans 1 jan t.e.m. vandaag", () => {
    const L = [
      { account: "700000", debit: 0, credit: 1000, entry_date: "2026-01-10" },
      { account: "604000", debit: 300, credit: 0, entry_date: "2026-02-03" },
      { account: "670000", debit: 50, credit: 0, entry_date: "2026-03-03" },
      { account: "630000", debit: 99, credit: 0, entry_date: "2026-12-01" },
      { account: "700000", debit: 0, credit: 500, entry_date: "2025-12-01" },
    ] as any;
    const rows = journalMonthRows(L, 2026, "2026-11-02");
    const sum = rows.reduce((a, r) => a + (r.profit ?? 0), 0);
    expect(sum).toBe(statements(trialBalance(L, "2026-01-01", "2026-11-02")).resultaat);
    expect(sum).toBe(650);
  });
});
describe("jaargelijking op het dashboard", () => {
  it("elk jaar met geboekte regels krijgt een rij, vorige jaren voorop", () => {
    const L = [
      { account: "700000", debit: 0, credit: 1000, entry_date: "2023-06-05" },
      { account: "700000", debit: 0, credit: 2000, entry_date: "2024-03-11" },
      { account: "700000", debit: 0, credit: 3000, entry_date: "2026-03-01" },
      { account: "700000", debit: 0, credit: 9999, entry_date: "2027-01-05" },
    ] as any;
    const rows = yearRows(L, "2026-11-02");
    expect(rows.map((r) => r.year)).toEqual([2023, 2024, 2026]);
    expect(rows.map((r) => r.revenue)).toEqual([1000, 2000, 3000]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
