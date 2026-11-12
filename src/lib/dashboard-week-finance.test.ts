import { expect, it } from "vitest";
import { journalWeekRows } from "./dashboard-week-finance";

it("berekent werkelijke weekomzet, kosten en resultaat zonder maandtotalen te verdelen", () => {
  const lines = [
    { entry_date: "2026-11-02", journal: "V", account: "700000", debit: 0, credit: 100 },
    { entry_date: "2026-11-08", journal: "A", account: "604000", debit: 20, credit: 0 },
    { entry_date: "2026-11-09", journal: "V", account: "700000", debit: 0, credit: 999 },
  ];
  const rows = journalWeekRows(lines, "2026-11-02", "2026-11-08");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.revenue).toBe(100);
  expect(rows[0]?.costs).toBe(20);
  expect(rows[0]?.profit).toBe(80);
});