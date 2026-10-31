import { describe, expect, it } from "vitest";
import { assertFinanceAdmin } from "./finance-admin";

describe("financiële toegang", () => {
  const context = (data: boolean | null, error: unknown = null) => ({ userId: "user", supabase: { rpc: async () => ({ data, error }) } } as unknown as Parameters<typeof assertFinanceAdmin>[0]);
  it("laat een bevestigde beheerder toe", async () => {
    await expect(assertFinanceAdmin(context(true))).resolves.toBeUndefined();
  });
  it("weigert een ploeg of marketing zonder beheerderrol", async () => {
    await expect(assertFinanceAdmin(context(false))).rejects.toThrow("Alleen voor beheerder");
  });
  it("weigert toegang als de rolcontrole faalt", async () => {
    await expect(assertFinanceAdmin(context(null, new Error("network")))).rejects.toThrow("Alleen voor beheerder");
  });
});