import { toDoc, dubbelSleutel, type WbInvoice } from "@/lib/werkbonnen";
import { invoiceToEntry, controlAccounts } from "@/lib/boekhouding";
import { fetchAll } from "@/lib/fetch-all";

export async function syncFinanceSales(db: any, userId: string) {
  const { data: company, error } = await db.from("companies").select("id").eq("user_id", userId).ilike("name", "Riory BV").maybeSingle();
  if (error || !company) return { ok: false as const, error: "De Riory-administratie is niet beschikbaar." };
  const invoices = await fetchAll<any>((a, b) => db.from("invoices").select("id,number,kind,credit_for,issue_date,due_date,customer,lines,net,vat,vat_rate,status,paid_amount,total,paid_at").order("id").range(a, b));
  const have = await fetchAll<any>((a, b) => db.from("fin_invoices").select("id,source_ref,number,doc_type,status,review_status").eq("company_id", company.id).eq("direction", "verkoop").order("id").range(a, b));
  const refs = new Map(have.map(row => [row.source_ref, row]));
  const byNumber = new Map(have.map(row => [dubbelSleutel(row.number, row.doc_type === "creditnota"), row]));
  const numbers = new Set(have.map(row => dubbelSleutel(row.number, row.doc_type === "creditnota")));
  const { data: accounts, error: accountError } = await db.from("fin_accounts").select("number").eq("company_id", company.id).eq("active", true);
  if (accountError) throw new Error("Rekeningschema lezen mislukt");
  const accs = (accounts ?? []).map((a: any) => a.number);
  const revenue = accs.includes("700000") ? "700000" : accs.filter((a: string) => a.startsWith("70")).sort()[0] ?? null;
  let nieuw = 0, geboekt = 0, teBeoordelen = 0, overgeslagen = 0, bijgewerkt = 0;
  for (const raw of invoices) {
    const doc = toDoc(raw as WbInvoice);
    if (!doc) continue;
    const numberKey = dubbelSleutel(doc.nummer, doc.credit);
    const existing = refs.get(doc.ref) ?? (numberKey ? byNumber.get(numberKey) : undefined);
    if (existing) {
      if (!doc.credit && existing.status !== "betaald" && Number(raw.paid_amount) >= Number(raw.total) && Number(raw.total) > 0) {
        const { error } = await db.from("fin_invoices").update({ status: "betaald", paid_at: raw.paid_at?.slice(0, 10) ?? null, bank_ref: `werkbonnen:${raw.id}` }).eq("id", existing.id);
        if (error) throw new Error("Betaalstatus synchroniseren mislukt");
        bijgewerkt++;
      }
      overgeslagen++; continue;
    }
    if (numberKey && numbers.has(numberKey)) { overgeslagen++; continue; }
    const paid = raw.kind !== "creditnota" && Number(raw.paid_amount) >= Number(raw.total) && Number(raw.total) > 0;
    const { data: inv, error } = await db.from("fin_invoices").insert({ user_id: userId, company_id: company.id, direction: "verkoop", doc_type: doc.credit ? "creditnota" : "factuur", counterparty: doc.klant, number: doc.nummer, invoice_date: doc.datum, due_date: raw.due_date, source: "werkbonnen", source_ref: doc.ref, status: paid ? "betaald" : "open", paid_at: paid ? raw.paid_at?.slice(0, 10) ?? null : null, bank_ref: paid ? `werkbonnen:${raw.id}` : null }).select("id").single();
    if (error) { if (error.code === "23505") { overgeslagen++; continue; } throw new Error("Verkoopfactuur overnemen mislukt"); }
    const lines = doc.lijnen.map(line => ({ user_id: userId, invoice_id: inv.id, description: line.omschrijving, ex_vat: line.ex, vat: line.vat, account: revenue, category: "omzet" }));
    const { error: lineError } = await db.from("fin_invoice_lines").insert(lines);
    if (lineError) { await db.from("fin_invoices").delete().eq("id", inv.id); throw new Error("Factuurlijnen overnemen mislukt"); }
    nieuw++;
    if (numberKey) numbers.add(numberKey);
    const entry = invoiceToEntry({ direction: "verkoop", doc_type: doc.credit ? "creditnota" : "factuur", lines }, controlAccounts(accs));
    if (revenue && !entry.error) {
      const { error: postError } = await db.rpc("fin_post_entry", { _company: company.id, _journal: "verkoop", _date: doc.datum, _description: `${doc.klant ?? "Klant"} ${doc.nummer ?? ""}`.trim(), _reference: doc.nummer ?? doc.ref, _source: "factuur", _source_ref: inv.id, _lines: entry.lines });
      if (!postError) {
        const { error: approveError } = await db.from("fin_invoices").update({ review_status: "goedgekeurd" }).eq("id", inv.id);
        if (approveError) throw new Error("Goedkeuring opslaan mislukt");
        geboekt++; continue;
      }
    }
    teBeoordelen++;
    const { error: taskError } = await db.from("fin_tasks").insert({ user_id: userId, finance_company_id: company.id, finance_event_key: `inv-review:${inv.id}`, title: `Factuur indelen: ${doc.klant ?? "Klant"} ${doc.nummer ?? ""}`, body_text: `Open: /finance?tab=facturen&id=${inv.id}` });
    if (taskError && taskError.code !== "23505") throw new Error("Opvolgtaak opslaan mislukt");
  }
  return { ok: true as const, nieuw, geboekt, teBeoordelen, overgeslagen, bijgewerkt };
}