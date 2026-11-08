import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { productCostLines } from "./product-costs";
import { simplaProductLines, type SimplaSaleBill, type SimplaSaleLine } from "./simpla-product-revenue";

let cache: { at: number; bills: SimplaSaleBill[]; lines: SimplaSaleLine[]; pBills: any[]; pLines: any[]; suppliers: any[] } | null = null;

/** Alleen-lezen: Simpla-verkooplijnen voor de dashboardtegels. Schrijft niets weg, ook niet naar de boekhouding. */
export const simplaDashboardProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Alleen voor beheerders");
    const token = process.env["SIMPLA_API_TOKEN"];
    if (!token) return { lines: [], costs: [], error: "Simpla-token ontbreekt" };
    try {
      if (!cache || Date.now() - cache.at > 30 * 60_000) {
        const get = async (dataType: string) => {
          const url = new URL("https://app-02.simpla.be/api/");
          url.searchParams.set("token", token); url.searchParams.set("dataType", dataType);
          const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60000) });
          if (!res.ok) throw new Error(`Simpla ${dataType} mislukt (HTTP ${res.status})`);
          const j = (await res.json()) as { status?: string; data?: any[] };
          if (j.status !== "OK" || !Array.isArray(j.data)) throw new Error(`Simpla gaf geen geldige ${dataType}`);
          return j.data;
        };
        const [bills, lines, pBills, pLines, suppliers] = await Promise.all([get("bill_sale"), get("billline_sale"), get("bill_purchase"), get("billline_purchase"), get("supplier")]);
        cache = { at: Date.now(), bills, lines, pBills, pLines, suppliers };
      }
      // Vanaf de eerste afgetekende werkbon telt de app zelf; Simpla daarvoor.
      const { data: first } = await context.supabase.from("work_orders").select("scheduled_date, signed_at").eq("status", "afgetekend").eq("no_invoice", false).order("signed_at", { ascending: true }).limit(20);
      const days = (first ?? []).map((o) => (o.scheduled_date ?? o.signed_at ?? "").slice(0, 10)).filter(Boolean).sort();
      const { data: app } = await context.supabase.from("purchase_invoices").select("supplier_name, invoice_number, invoice_date, lines").gte("invoice_date", "2000-01-01").limit(10000);
      const costs = productCostLines({ bills: cache.pBills, lines: cache.pLines, suppliers: cache.suppliers }, app ?? [], data.from, data.to);
      return { lines: simplaProductLines(cache.bills, cache.lines, data.from, data.to, days[0] ?? null), costs, error: null };
    } catch (e) {
      return { lines: [], costs: [], error: e instanceof Error ? e.message : "Simpla niet bereikbaar" };
    }
  });
