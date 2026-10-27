import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen voor beheerder");
}

/** Stores the Ponto client ID and secret encrypted; the secret is never stored readable. */
export const savePontoCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { clientId: string; clientSecret: string }) => {
    if (!i.clientId.trim() || !i.clientSecret.trim()) throw new Error("Vul client ID en client secret in");
    return { clientId: i.clientId.trim(), clientSecret: i.clientSecret.trim() };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { encryptConnectionKey } = await import("@/lib/connectionKeyCrypto.server");
    const { error } = await context.supabase.from("settings").update({
      ponto_client_ciphertext: encryptConnectionKey(`${data.clientId}\n${data.clientSecret}`),
    }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const disconnectPonto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("settings").update({ ponto_client_ciphertext: null, ponto_last_sync: null }).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const pontoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: s } = await context.supabase.from("settings").select("ponto_client_ciphertext, ponto_last_sync").eq("id", 1).single();
    return { connected: Boolean(s?.ponto_client_ciphertext), lastSync: s?.ponto_last_sync ?? null };
  });

/** Manual "check payments now" from the Facturen page. */
export const syncPontoNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { syncPontoPayments } = await import("@/lib/ponto-sync.server");
    return syncPontoPayments(context.supabase);
  });
