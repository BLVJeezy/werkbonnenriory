import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchSimplaCustomer, type SimplaCustomer } from "./simpla";

export const simplaOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Alleen voor beheerder");
    const { data, error } = await context.supabase.from("simpla_sync").select("*, work_orders(number, customer_name)").order("created_at", { ascending: false });
    if (error) throw new Error("Simpla-overzicht ophalen mislukt");
    return { configured: Boolean(process.env['SIMPLA_API_TOKEN']), rows: data ?? [] };
  });

/** Only verified read operations; creation is gated until Simpla confirms its write contract. */
export const retrySimpla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workOrderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: wo } = await context.supabase.from("work_orders").select("id, status, customer_name, email, billing_email").eq("id", data.workOrderId).single();
    if (!wo || wo.status !== "afgetekend") throw new Error("Geen toegang tot een afgeronde werkbon");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: queue } = await supabaseAdmin.from("simpla_sync").select("status").eq("work_order_id", wo.id).single();
    if (!queue || queue.status !== "waiting") return { ok: false, error: "Deze werkbon wacht niet op Simpla." };
    const token = process.env['SIMPLA_API_TOKEN'];
    let message = "Simpla-token ontbreekt. Stel eerst de koppeling in.";
    if (token) {
      try {
        const url = new URL("https://app-02.simpla.be/api/");
        url.searchParams.set("token", token);
        url.searchParams.set("dataType", "customer");
        const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
        // Never echo raw responses: the query token could be reflected by the provider.
        if (!response.ok) message = `Simpla klantopzoeking mislukt (HTTP ${response.status}).`;
        else {
          const result = await response.json() as { status?: string; data?: SimplaCustomer[] };
          if (result.status !== "OK" || !Array.isArray(result.data)) message = "Simpla gaf geen geldig klantenantwoord.";
          else if (!matchSimplaCustomer(result.data, wo.customer_name, wo.billing_email || wo.email)) message = "Geen unieke Simpla-klant gevonden op naam of e-mail.";
          else message = "Klant gevonden. Het aanmaken van de factuur in Simpla kon niet voltooid worden (HTTP 403 bij controle op 28/10/2026). Er is niets aangemaakt.";
        }
      } catch { message = "Simpla is niet bereikbaar of gaf een onleesbaar antwoord. Er is niets aangemaakt."; }
    }
    const { error } = await supabaseAdmin.from("simpla_sync").update({ error: message, attempted_at: new Date().toISOString() }).eq("work_order_id", wo.id).eq("status", "waiting");
    if (error) throw new Error("Simpla-fout opslaan mislukt");
    return { ok: false, error: message };
  });