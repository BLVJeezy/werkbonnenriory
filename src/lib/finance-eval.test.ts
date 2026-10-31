import { describe, expect, it } from "vitest";
import { evaluateFinance, FinanceReadError } from "./finance-eval";

// Nep-client: elke tabel geeft lege data, behalve één tabel die een leesfout geeft. Schrijfacties worden geteld.
function fakeDb(failTable: string | null, existing: any[] = []) {
  const writes: string[] = [];
  const builder = (table: string) => {
    let op = "select";
    const b: any = new Proxy({}, {
      get(_, k) {
        if (k === "insert" || k === "update" || k === "upsert" || k === "delete") return () => { op = String(k); writes.push(`${table}.${op}`); return b; };
        if (k === "then") {
          const res = table === failTable ? { data: null, error: { message: "boom" } }
            : table === "companies" ? { data: { id: "c1", name: "Riory BV", simpla_bound: true }, error: null }
            : table === "fin_tasks" && op === "select" ? { data: existing, error: null }
            : { data: op === "update" ? [{ id: "x" }] : [], error: null };
          return (r: any) => Promise.resolve(res).then(r);
        }
        return () => b;
      },
    });
    return b;
  };
  return { db: { from: builder } as any, writes };
}

describe("evaluateFinance fail-closed", () => {
  for (const t of ["fin_invoices", "fin_investments", "fin_budgets", "fin_months", "fin_entries", "fin_sync_status", "fin_tasks"]) {
    it(`leesfout in ${t}: geen enkele taak aangemaakt of gesloten`, async () => {
      const open = [{ id: "m1", finance_event_key: "inv-review:a", status: "taak" }];
      const { db, writes } = fakeDb(t, open);
      await expect(evaluateFinance(db, "u1", "c1", "2026-10-05")).rejects.toBeInstanceOf(FinanceReadError);
      expect(writes).toEqual([]);
    });
  }
  it("verdwenen bronfactuur sluit open taak niet", async () => {
    const { db, writes } = fakeDb(null, [{ id: "m1", finance_event_key: "inv-review:weg", status: "taak" }]);
    await evaluateFinance(db, "u1", "c1", "2026-10-05");
    expect(writes.filter((w) => w === "fin_tasks.update")).toEqual([]);
  });
});
