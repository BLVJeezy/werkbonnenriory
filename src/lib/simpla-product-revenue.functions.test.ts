import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { simplaDashboardProducts } from "./simpla-product-revenue.functions";

type Result = { lines: { amount: number }[]; error: string | null; costError: string | null };
const run = simplaDashboardProducts as unknown as (args: unknown) => Promise<Result>;
const context = (admin = true) => ({ userId: "test-admin", supabase: { rpc: async () => ({ data: admin }), from: () => {
  const q = { select: () => q, order: () => q, range: async () => ({ data: [], error: null }) };
  return q;
} } });
const data = { from: "2026-01-01", to: "2026-12-31" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Simpla read authorization and partial failure", () => {
  it("rejects non-admin users before contacting Simpla", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(run({ data, context: context(false) })).rejects.toThrow("Alleen voor beheerders");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports missing credentials without fictitious sales", async () => {
    vi.stubEnv("SIMPLA_API_TOKEN", "");
    expect(await run({ data, context: context() })).toMatchObject({ lines: [], error: "Simpla-token ontbreekt" });
  });
  it("purchase failures do not erase sales and credits", async () => {
    vi.stubEnv("SIMPLA_API_TOKEN", "test-not-a-real-token");
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      const t = url.searchParams.get("dataType");
      if (["bill_purchase", "billline_purchase", "supplier"].includes(t ?? "")) return new Response("unavailable", { status: 503 });
      const rows = t === "bill_sale" ? [{ billDatabaseId: 1, billId: "S1", billDate: "2026-01-01" }] : t === "billline_sale" ? [{ billDatabaseId: 1, billLineNumber: 1, billLineUnitPrice: 100 }] : t === "creditnote" ? [{ creditnoteDatabaseId: 1, creditnoteId: "CN1", creditnoteDate: "2026-01-02" }] : [{ creditnoteDatabaseId: 1, creditnoteLineId: 1, creditnoteLineNumber: 1, creditnoteLineUnitPrice: 25 }];
      return Response.json({ status: "OK", data: rows });
    }));
    const result = await run({ data, context: context() });
    expect(result.lines.map(l => l.amount)).toEqual([100, -25]);
    expect(result.error).toBeNull();
    expect(result.costError).toContain("HTTP 503");
  });
});