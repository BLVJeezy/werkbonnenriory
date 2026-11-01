import { describe, expect, it } from "vitest";
import { syncFinanceSales } from "./finance-sales.server";

function fakeDb(existing = false, imported = false) {
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  const filters: any[] = [];
  let posts = 0;
  const raw = { id: "source", number: "20260814", issue_date: "2026-10-24", due_date: "2026-11-07", net: 100, vat: 21, total: 121, paid_amount: 121, paid_at: "2026-10-31T10:00:00Z", kind: "factuur", status: "verzonden", customer: { name: "Klant" } };
  const db = { from(table: string) {
    let op = "select";
    const q: any = new Proxy({}, { get(_, key) {
      if (["insert", "update", "delete"].includes(String(key))) return (data: any) => { op = String(key); if (op === "insert") (inserts[table] ??= []).push(data); if (op === "update") (updates[table] ??= []).push(data); return q; };
      if (key === "eq" || key === "ilike") return (...args: any[]) => { filters.push([table, key, ...args]); return q; };
      if (key === "then") {
        const data = op === "insert" && table === "fin_invoices" ? { id: "target" }
          : table === "companies" ? { id: "company" }
          : table === "invoices" ? [raw]
          : table === "fin_invoices" && op === "select" ? existing ? [{ id: "target", source_ref: imported ? "previous-export-id" : "wb-source", number: raw.number, doc_type: "factuur", status: "open" }] : []
          : table === "fin_accounts" ? ["700000", "400000", "451000"].map(number => ({ number })) : [];
        return (resolve: any) => Promise.resolve({ data, error: null }).then(resolve);
      }
      return () => q;
    } }); return q;
  }, rpc: async () => { posts++; return { error: null }; } };
  return { db, inserts, updates, filters, posts: () => posts };
}

describe("verkoopfacturen naar eigen boekhouding", () => {
  it("behoudt nummer, bedragen en betaalstatus zonder nieuwe verkoopfactuur", async () => {
    const f = fakeDb();
    const result = await syncFinanceSales(f.db, "user");
    expect(result).toMatchObject({ ok: true, nieuw: 1, geboekt: 1 });
    expect(f.inserts['fin_invoices']?.[0]).toMatchObject({ number: "20260814", status: "betaald", source_ref: "wb-source" });
    expect(f.inserts['fin_invoice_lines']?.[0]?.[0]).toMatchObject({ ex_vat: 100, vat: 21 });
    expect(f.inserts['invoices']).toBeUndefined();
    expect(f.posts()).toBe(1);
  });
  it("boekt dezelfde bronfactuur geen tweede keer", async () => {
    const f = fakeDb(true);
    expect(await syncFinanceSales(f.db, "user")).toMatchObject({ ok: true, nieuw: 0, overgeslagen: 1 });
    expect(f.posts()).toBe(0);
    expect(f.inserts['fin_invoices']).toBeUndefined();
  });
  it("koppelt een geïmporteerd factuurnummer aan de lokale betaling zonder dubbele boeking", async () => {
    const f = fakeDb(true, true);
    expect(await syncFinanceSales(f.db, "user")).toMatchObject({ nieuw: 0, bijgewerkt: 1 });
    expect(f.updates['fin_invoices']?.[0]).toMatchObject({ paid_amount: 121, status: "betaald", paid_at: "2026-10-31", bank_ref: "werkbonnen:source" });
    expect(f.posts()).toBe(0);
    expect(f.inserts['fin_invoices']).toBeUndefined();
  });
  it("verbindt Riory BV onafhankelijk van een Simpla-aankoopkoppeling", async () => {
    const f = fakeDb();
    await syncFinanceSales(f.db, "user");
    expect(f.filters).toContainEqual(["companies", "ilike", "name", "Riory BV"]);
    expect(f.filters.some(filter => filter[0] === "companies" && filter[2] === "simpla_bound")).toBe(false);
  });
});