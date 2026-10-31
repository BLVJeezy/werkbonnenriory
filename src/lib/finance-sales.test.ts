import { describe, expect, it } from "vitest";
import { syncFinanceSales } from "./finance-sales.server";

function fakeDb(existing = false) {
  const inserts: Record<string, any[]> = {};
  let posts = 0;
  const raw = { id: "source", number: "20260814", issue_date: "2026-10-24", due_date: "2026-11-07", net: 100, vat: 21, total: 121, paid_amount: 121, paid_at: "2026-10-31T10:00:00Z", kind: "factuur", status: "verzonden", customer: { name: "Klant" } };
  const db = { from(table: string) {
    let op = "select", payload: any;
    const q: any = new Proxy({}, { get(_, key) {
      if (["insert", "update", "delete"].includes(String(key))) return (data: any) => { op = String(key); payload = data; if (op === "insert") (inserts[table] ??= []).push(data); return q; };
      if (key === "then") {
        const data = op === "insert" && table === "fin_invoices" ? { id: "target" }
          : table === "companies" ? { id: "company" }
          : table === "invoices" ? [raw]
          : table === "fin_invoices" && op === "select" ? existing ? [{ id: "target", source_ref: "wb-source", number: raw.number, doc_type: "factuur" }] : []
          : table === "fin_accounts" ? ["700000", "400000", "451000"].map(number => ({ number })) : [];
        return (resolve: any) => Promise.resolve({ data, error: null }).then(resolve);
      }
      return () => q;
    } }); return q;
  }, rpc: async () => { posts++; return { error: null }; } };
  return { db, inserts, posts: () => posts };
}

describe("verkoopfacturen naar eigen boekhouding", () => {
  it("behoudt nummer, bedragen en betaalstatus zonder nieuwe verkoopfactuur", async () => {
    const f = fakeDb();
    const result = await syncFinanceSales(f.db, "user");
    expect(result).toMatchObject({ ok: true, nieuw: 1, geboekt: 1 });
    expect(f.inserts.fin_invoices[0]).toMatchObject({ number: "20260814", status: "betaald", source_ref: "wb-source" });
    expect(f.inserts.fin_invoice_lines[0][0]).toMatchObject({ ex_vat: 100, vat: 21 });
    expect(f.inserts.invoices).toBeUndefined();
    expect(f.posts()).toBe(1);
  });
  it("boekt dezelfde bronfactuur geen tweede keer", async () => {
    const f = fakeDb(true);
    expect(await syncFinanceSales(f.db, "user")).toMatchObject({ ok: true, nieuw: 0, overgeslagen: 1 });
    expect(f.posts()).toBe(0);
    expect(f.inserts.fin_invoices).toBeUndefined();
  });
});