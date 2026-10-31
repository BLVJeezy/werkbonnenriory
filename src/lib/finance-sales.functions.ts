import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFinanceAdmin } from "@/lib/finance-admin";

export const syncWerkbonnenSales = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertFinanceAdmin(context);
  const { syncFinanceSales } = await import("@/lib/finance-sales.server");
  return syncFinanceSales(context.supabase, context.userId);
});