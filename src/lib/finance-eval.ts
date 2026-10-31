import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFinanceTasks, monthKey, resolutionEvidence, summarizeMonth, type Entry, type InvLine, type Investment, type TaskInvoice } from "@/lib/finance";

// Gedeelde evaluatie voor browser (RLS als gebruiker) en dagelijkse server-job (service role).
// Elke query filtert expliciet op user_id + company_id, zodat ook de service-role-variant tenant-veilig is.
// Fail closed: één leesfout => niets aanmaken of afsluiten.
export class FinanceReadError extends Error {}

async function all<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new FinanceReadError("leesfout");
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
const one = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>) => {
  const { data, error } = await p;
  if (error) throw new FinanceReadError("leesfout");
  return data;
};

export type EvalResult = { created: number; resolved: number; failedWrites: number };

export async function evaluateFinance(db: SupabaseClient<any>, userId: string, companyId: string, today = new Date().toISOString().slice(0, 10)): Promise<EvalResult> {
  const company = await one<any>(db.from("companies").select("id, name, simpla_bound").eq("id", companyId).eq("user_id", userId).maybeSingle());
  if (!company) throw new FinanceReadError("bedrijf niet gevonden voor deze gebruiker");
  const own = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => q.eq("user_id", userId).eq("company_id", companyId);

  const [inv, lines, investments, budgets, entries, months, sync, existing] = await Promise.all([
    all<any>((a, b) => own(db.from("fin_invoices").select("*") as any).order("id").range(a, b)),
    all<any>((a, b) => db.from("fin_invoice_lines").select("*, fin_invoices!inner(company_id, user_id, invoice_date, direction, doc_type, review_status)").eq("user_id", userId).eq("fin_invoices.company_id", companyId).eq("fin_invoices.user_id", userId).order("id").range(a, b)),
    all<any>((a, b) => own(db.from("fin_investments").select("*") as any).order("id").range(a, b)),
    all<any>((a, b) => own(db.from("fin_budgets").select("*") as any).order("id").range(a, b)),
    all<any>((a, b) => own(db.from("fin_entries").select("*") as any).order("id").range(a, b)),
    all<any>((a, b) => own(db.from("fin_months").select("*") as any).order("id").range(a, b)),
    one<any>(own(db.from("fin_sync_status").select("last_success_at") as any).eq("source", "simpla").maybeSingle()),
    all<any>((a, b) => db.from("fin_tasks").select("id, finance_event_key, status").eq("user_id", userId).eq("finance_company_id", companyId).not("finance_event_key", "is", null).order("id").range(a, b)),
  ]);

  const totals = new Map<string, number>();
  for (const l of lines) totals.set(l.invoice_id, (totals.get(l.invoice_id) ?? 0) + Number(l.ex_vat) + Number(l.vat));
  const invoices: TaskInvoice[] = inv.map((i) => ({ ...i, total: totals.get(i.id) ?? 0 }));
  const invs: (Investment & { id: string; name: string })[] = investments.map((v) => ({
    ...v,
    capitalizable_amount: v.capitalizable_amount == null ? null : Number(v.capitalizable_amount),
    purchase_amount: v.purchase_amount == null ? null : Number(v.purchase_amount),
    residual_value: Number(v.residual_value), opening_accumulated: Number(v.opening_accumulated),
  }));
  const E: Entry[] = entries.map((e) => ({ ...e, amount: Number(e.amount) }));
  const L: InvLine[] = lines.filter((l) => l.fin_invoices.invoice_date).map((l) => ({
    month: monthKey(l.fin_invoices.invoice_date), direction: l.fin_invoices.direction, doc_type: l.fin_invoices.doc_type,
    category: l.category, ex_vat: Number(l.ex_vat), approved: l.fin_invoices.review_status === "goedgekeurd", is_investment: l.is_investment,
  }));
  const actualByCat: Record<string, number> = {};
  for (const b of budgets) {
    const s = summarizeMonth(b.month, E.filter((e) => e.category === b.category), L.filter((l) => l.category === b.category));
    if (s.costs != null) actualByCat[`${b.month}|${b.category}`] = s.costs;
  }
  const tasks = buildFinanceTasks({
    companyName: company.name, today, invoices, investments: invs,
    budgets: budgets.map((b) => ({ ...b, amount: Number(b.amount) })), actualByCat,
    months: months.map((m) => ({ month: m.month, complete: m.revenue_complete && m.costs_complete && m.bank_complete })),
    simpla: { bound: !!company.simpla_bound, lastSuccess: sync?.last_success_at ?? null },
  });

  const have = new Set(existing.map((m) => m.finance_event_key));
  let created = 0, failedWrites = 0;
  for (const t of tasks) {
    if (have.has(t.key)) continue;
    const { error } = await db.from("fin_tasks").insert({
      user_id: userId, status: "taak", title: t.title, body_text: t.body, priority: t.priority, due_date: t.due,
      finance_event_key: t.key, finance_company_id: companyId,
    });
    if (!error) created++;
    else if ((error as { code?: string }).code !== "23505") failedWrites++; // 23505 = gelijktijdig al aangemaakt
  }

  const src = { invoices: new Map(invoices.map((i) => [i.id, i])), investments: new Map(invs.map((v) => [v.id, v as Investment])) };
  let resolved = 0;
  for (const m of existing) {
    if (m.status !== "taak" && m.status !== "opvolgen") continue; // handmatig gesloten/genegeerd blijft zo
    const ev = resolutionEvidence(m.finance_event_key, src);
    if (!ev) continue;
    const { data: upd, error } = await db.from("fin_tasks").update({ status: "afgerond" }).eq("id", m.id).eq("user_id", userId).in("status", ["taak", "opvolgen"]).select("id");
    if (error) { failedWrites++; continue; }
    if (!upd?.length) continue;
    resolved++;
    const { error: aErr } = await db.from("fin_audit").insert({ user_id: userId, company_id: companyId, entity: "taak", entity_id: m.id, action: "auto_afgesloten", detail: { key: m.finance_event_key, bewijs: ev } });
    if (aErr) failedWrites++;
  }
  return { created, resolved, failedWrites };
}
