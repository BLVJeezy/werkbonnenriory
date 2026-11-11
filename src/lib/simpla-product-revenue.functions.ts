import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { productCostLines } from "./product-costs";
import { simplaProductLines, type SimplaSaleBill, type SimplaSaleLine } from "./simpla-product-revenue";
import { fetchAll } from "./fetch-all";

/** Alleen-lezen: Simpla-verkooplijnen voor de dashboardtegels. Schrijft niets weg, ook niet naar de boekhouding. */
export const simplaDashboardProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Alleen voor beheerders");
    const token = process.env["SIMPLA_API_TOKEN"];
    const app = await fetchAll((from, to) => context.supabase.from("purchase_invoices").select("supplier_name, invoice_number, invoice_date, lines").order("id").range(from, to));
    const localCosts = productCostLines({ bills: [], lines: [], suppliers: [] }, app, data.from, data.to);
    if (!token) return { lines: [], costs: localCosts, error: "Simpla-token ontbreekt", costError: "Historische aankoopkosten niet beschikbaar", checkedAt: null };
    try {
        const get = async (dataType: string) => {
          const url = new URL("https://app-02.simpla.be/api/");
          url.searchParams.set("token", token); url.searchParams.set("dataType", dataType);
          let res: Response;
          try { res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(45000) }); }
          catch { throw new Error(`Simpla ${dataType}: verbinding mislukt of tijdslimiet bereikt`); }
          if (!res.ok) throw new Error(`Simpla ${dataType} mislukt (HTTP ${res.status})`);
          const j = (await res.json()) as { status?: string; data?: any[] };
          if (j.status !== "OK" || !Array.isArray(j.data)) throw new Error(`Simpla gaf geen geldige ${dataType}`);
          return j.data;
        };
        // Isolate purchase failures: they must not erase valid sales or credit notes.
        const purchaseResult = Promise.all([get("bill_purchase"), get("billline_purchase"), get("supplier")]).then(([bills, lines, suppliers]) => ({ costs: productCostLines({ bills, lines, suppliers }, app, data.from, data.to), error: null as string | null })).catch(e => ({ costs: localCosts, error: e instanceof Error ? e.message : "Historische aankoopkosten niet beschikbaar" }));
        const [bills, lines, credits, creditLines, numbers] = await Promise.all([get("bill_sale"), get("billline_sale"), get("creditnote"), get("creditnoteline"), fetchAll((from, to) => context.supabase.from("invoices").select("number").order("id").range(from, to))]);
        const allBills: SimplaSaleBill[] = [...bills, ...credits.map(c => ({ billDatabaseId: -Number(c.creditnoteDatabaseId), billId: c.creditnoteId, billDate: c.creditnoteDate, billStatus: c.creditnoteStatus, credit: true }))];
        const allLines: SimplaSaleLine[] = [...lines, ...creditLines.map(l => ({ billDatabaseId: -Number(l.creditnoteDatabaseId), billLineId: -Number(l.creditnoteLineId), billLineProductId: l.creditnoteLineProductId, billLineProductDescription: l.creditnoteLineProductDescription, billLineUnitPrice: l.creditnoteLineUnitPrice, billLineNumber: l.creditnoteLineNumber, billLineDiscount: l.creditnoteLineDiscount }))];
        const purchase = await purchaseResult;
        return { lines: simplaProductLines(allBills, allLines, data.from, data.to, null, numbers.map(i => i.number)), costs: purchase.costs, error: null, costError: purchase.error, checkedAt: new Date().toISOString() };
    } catch (e) {
      return { lines: [], costs: localCosts, error: e instanceof Error ? e.message : "Simpla niet bereikbaar", costError: "Historische aankoopkosten onvolledig", checkedAt: null };
    }
  });
