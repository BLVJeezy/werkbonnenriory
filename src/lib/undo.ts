import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

/** Maakt een boeking volledig ongedaan: bankverrichting weer "te verwerken",
 *  gekoppelde factuur terug onbetaald, boeking (met lijnen) weg, en een auditregel. */
export async function undoEntry(company: string, entryId: string): Promise<void> {
  const { data: txs } = await db.from("fin_bank_tx").select("id, matched_invoice_id").eq("company_id", company).eq("entry_id", entryId);
  for (const t of txs ?? []) {
    if (t.matched_invoice_id) {
      await db.from("fin_invoices").update({ status: "open", paid_at: null, bank_ref: null }).eq("id", t.matched_invoice_id).eq("bank_ref", t.id);
    }
    await db.from("fin_bank_tx").update({ entry_id: null, matched_invoice_id: null }).eq("id", t.id);
  }
  const { error } = await db.from("fin_journal_entries").delete().eq("id", entryId).eq("company_id", company);
  if (error) throw new Error(error.message);
  await db.from("fin_audit").insert({ company_id: company, entity: "boeking", entity_id: entryId, action: "ongedaan_gemaakt" });
}

/** Trekt de goedkeuring van een factuur in en maakt een eventuele boeking ervan ongedaan. */
export async function unapproveInvoice(company: string, inv: { id: string; source?: string | null; source_ref?: string | null }): Promise<number> {
  let q = db.from("fin_journal_entries").select("id, source, source_ref").eq("company_id", company);
  if (inv.source === "simpla" && inv.source_ref) q = q.or(`and(source.eq.factuur,source_ref.eq.${inv.id}),and(source.eq.simpla,source_ref.eq.${inv.source_ref})`);
  else q = q.eq("source", "factuur").eq("source_ref", inv.id);
  const { data: entries } = await q;
  for (const e of entries ?? []) await undoEntry(company, e.id);
  const { error } = await db.from("fin_invoices").update({ review_status: "te_beoordelen" }).eq("id", inv.id);
  if (error) throw new Error(error.message);
  await db.from("fin_audit").insert({ company_id: company, entity: "factuur", entity_id: inv.id, action: "goedkeuring_ingetrokken", detail: { boekingen_ongedaan: entries?.length ?? 0 } });
  return entries?.length ?? 0;
}
