import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapSimplaPurchaseCreditNotes, mapSimplaSalesCreditNotes } from "./simpla-creditnotes";

const SIMPLA_URL = "https://www.mailtaken.be/api/index.php";

async function fetchSimpla(token: string, datatype: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SIMPLA_URL}?datatype=${encodeURIComponent(datatype)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Simpla ${datatype} mislukt (${res.status})`);
  const json = (await res.json()) as unknown;
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const rec = json as Record<string, unknown>;
    const arr = rec["data"] ?? rec["items"] ?? rec[datatype];
    if (Array.isArray(arr)) return arr as Record<string, unknown>[];
  }
  return [];
}

export const importSimplaCreditNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string }) => {
    if (!data?.companyId || typeof data.companyId !== "string") throw new Error("Bedrijf ontbreekt");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Alleen beheerders mogen creditnota's uit Simpla inlezen");

    const { data: owns } = await supabase.rpc("owns_company", { _company: data.companyId });
    if (!owns) throw new Error("Geen toegang tot dit bedrijf");

    const token = process.env["SIMPLA_API_TOKEN"] ?? "";
    if (!token) throw new Error("SIMPLA_API_TOKEN ontbreekt op de server");

    const { data: existingRows, error: exErr } = await supabase
      .from("fin_invoices")
      .select("source_ref")
      .eq("company_id", data.companyId)
      .eq("source", "simpla")
      .not("source_ref", "is", null);
    if (exErr) throw new Error(exErr.message);
    const existingRefs = new Set((existingRows ?? []).map((r) => String(r.source_ref)));

    const [notes, noteLines, customers, bills, suppliers] = await Promise.all([
      fetchSimpla(token, "creditnote"),
      fetchSimpla(token, "creditnoteline"),
      fetchSimpla(token, "customer"),
      fetchSimpla(token, "bill_purchase"),
      fetchSimpla(token, "supplier"),
    ]);

    const sales = mapSimplaSalesCreditNotes(notes, noteLines, customers, existingRefs);
    const purchases = mapSimplaPurchaseCreditNotes(bills, suppliers, existingRefs);
    const all = [...sales, ...purchases];

    let importedSales = 0;
    let importedPurchases = 0;
    for (const item of all) {
      const { data: inserted, error: insErr } = await supabase
        .from("fin_invoices")
        .insert({
          user_id: userId,
          company_id: data.companyId,
          direction: item.direction,
          doc_type: item.doc_type,
          source: item.source,
          source_ref: item.source_ref,
          number: item.number,
          counterparty: item.counterparty,
          invoice_date: item.invoice_date,
          due_date: item.due_date,
          status: item.status,
          review_status: item.review_status,
          paid_amount: item.paid_amount,
        })
        .select("id")
        .single();
      if (insErr || !inserted) continue;
      await supabase.from("fin_invoice_lines").insert(
        item.lines.map((l) => ({
          invoice_id: inserted.id,
          account: l.account,
          description: l.description,
          ex_vat: l.ex_vat,
          vat: l.vat,
          vat_rate: l.vat_rate,
        })),
      );
      if (item.direction === "verkoop") importedSales++;
      else importedPurchases++;
    }

    return { importedSales, importedPurchases, totalNew: importedSales + importedPurchases };
  });