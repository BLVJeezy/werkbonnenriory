import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const simplaOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Alleen voor beheerder");
    return { configured: false, rows: [] };
  });

/** Compatibility endpoint for older previews; sales synchronization is retired. */
export const retrySimpla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workOrderId: z.string().uuid() }).parse(input))
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Alleen voor beheerder");
    return { ok: false, error: "Simpla-verkoopfacturatie is uitgeschakeld. Maak facturen in deze app." };
  });