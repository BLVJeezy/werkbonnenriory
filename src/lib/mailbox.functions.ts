import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const MAILBOX_ADDRESS = "afspraak@riory.be";
export const importFromMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Alleen de beheerder kan afspraakmails ophalen.");
    const { importTaskMailbox } = await import("@/lib/task-mail-import.server");
    return importTaskMailbox(context.supabase, context.userId);
  });
