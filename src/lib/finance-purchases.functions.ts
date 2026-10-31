import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFinanceAdmin } from "@/lib/finance-admin";

export const syncFinancePurchases = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertFinanceAdmin(context);
  const { syncFinancePurchaseImports } = await import("@/lib/finance-purchases.server");
  return syncFinancePurchaseImports(context.supabase, context.userId);
});