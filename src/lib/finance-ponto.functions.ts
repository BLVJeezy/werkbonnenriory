import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFinanceAdmin } from "@/lib/finance-admin";

export const pontoAccounts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertFinanceAdmin(context);
  const { financePontoAccounts } = await import("@/lib/finance-ponto.server");
  return financePontoAccounts(context.supabase);
});

export const pontoSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid(), bankAccount: z.string().min(1).max(20), since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertFinanceAdmin(context);
    const { data: company, error } = await context.supabase.from("companies").select("id").eq("id", data.companyId).eq("user_id", context.userId).maybeSingle();
    if (error || !company) throw new Error("Bedrijf niet gevonden");
    const { financePontoSync } = await import("@/lib/finance-ponto.server");
    return financePontoSync(context.supabase, context.userId, data);
  });