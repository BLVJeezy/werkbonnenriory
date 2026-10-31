import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BankInvoice } from "@/lib/bank-link";

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

export const bankLinkInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BankInvoice[]> => {
    await assertAdmin(context);
    const invoices: BankInvoice[] = [];
    for (let from = 0; ; from += 500) {
      const { data, error } = await context.supabase.from("invoices")
        .select("id,number,customer,total,paid_amount,kind").eq("kind", "factuur")
        .order("created_at", { ascending: false }).order("id").range(from, from + 499);
      if (error) throw new Error("Facturen konden niet geladen worden");
      for (const row of data ?? []) {
        if (Number(row.total) - Number(row.paid_amount) <= 0.005) continue;
        const customer = row.customer as { name?: string } | null;
        invoices.push({ id: row.id, number: row.number, customerName: customer?.name ?? "Onbekend", total: Number(row.total), paidAmount: Number(row.paid_amount), kind: row.kind });
      }
      if ((data?.length ?? 0) < 500) break;
    }
    return invoices;
  });

export const linkBankTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ transactionKey: z.string().trim().min(1).max(500), invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: paidAmount, error } = await context.supabase.rpc("link_bank_transaction", { p_transaction_key: data.transactionKey, p_invoice_id: data.invoiceId });
    if (error) throw new Error(error.message);
    return { paidAmount: Number(paidAmount) };
  });
