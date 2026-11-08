import { assertAccountAdmin } from "@/lib/admin-accounts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
type AuthClient = SupabaseClient<Database>;
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function verifyAdmin(client: AuthClient, userId: string) {
  await assertAccountAdmin(client, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await verifyAdmin(context.supabase, context.userId);
    const { data, error } = await admin.from("tk_approved_devices").select("id, device_name, status, requested_at, approved_at, last_seen_at").order("requested_at", { ascending: false });
    if (error) throw new Error("Toestellen konden niet worden geladen");
    return data ?? [];
  });

export const updateDeviceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: string }) => z.object({ id: z.string().uuid(), status: z.enum(["approved", "blocked"]) }).parse(data))
  .handler(async ({ data, context }) => {
    const admin = await verifyAdmin(context.supabase, context.userId);
    const patch = data.status === "approved"
      ? { status: data.status, approved_at: new Date().toISOString(), approved_by: context.userId }
      : { status: data.status, approved_at: null, approved_by: null };
    const { error } = await admin.from("tk_approved_devices").update(patch).eq("id", data.id);
    if (error) throw new Error("Toestel bijwerken mislukt");
    return { ok: true };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const admin = await verifyAdmin(context.supabase, context.userId);
    const { error } = await admin.from("tk_approved_devices").delete().eq("id", data.id);
    if (error) throw new Error("Toestel verwijderen mislukt");
    return { ok: true };
  });