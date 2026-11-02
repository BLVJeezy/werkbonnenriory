import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { depreciationSchedule, loanSchedule, monthKey, r2, summarizeMonth, type Entry, type InvLine } from "@/lib/finance";

const db = supabase as any;
const eur = (n: number | null | undefined) => (n == null ? "onbekend" : new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n));

export function useFinData(c: string) {
  return useQuery({
    queryKey: ["fin", "data", c],
    enabled: !!c,
    queryFn: async () => {
      const [entries, lines, months, budgets, inv, loans] = await Promise.all([
        fetchAll((a, b) => db.from("fin_entries").select("*").eq("company_id", c).order("id").range(a, b)),
        fetchAll((a, b) => db.from("fin_invoice_lines").select("*, fin_invoices!inner(company_id, invoice_date, direction, doc_type, review_status)").eq("fin_invoices.company_id", c).order("id").range(a, b)),
        db.from("fin_months").select("*").eq("company_id", c),
        db.from("fin_budgets").select("*").eq("company_id", c),
        db.from("fin_investments").select("*").eq("company_id", c),
        db.from("fin_loans").select("*").eq("company_id", c),
      ]);
      const E: Entry[] = (entries as any[]).map((e) => ({ ...e, amount: Number(e.amount) }));
      const L: InvLine[] = (lines as any[]).filter((l) => l.fin_invoices.invoice_date).map((l) => ({
        month: monthKey(l.fin_invoices.invoice_date), direction: l.fin_invoices.direction, doc_type: l.fin_invoices.doc_type,
        category: l.category, ex_vat: Number(l.ex_vat), approved: l.fin_invoices.review_status === "goedgekeurd", is_investment: l.is_investment,
      }));
      return { E, L, months: (months.data ?? []) as any[], budgets: (budgets.data ?? []) as any[], investments: (inv.data ?? []) as any[], loans: (loans.data ?? []) as any[] };
    },
  });
}

export const monthNames = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const compactEur = (n: number) => new Intl.NumberFormat("nl-BE", { notation: "compact", maximumFractionDigits: 1 }).format(n);
type ChartRow = { label: string; revenue: number | null; costs: number | null; profit: number | null };

// Zelfstandige SVG-grafieken: geen extra React-runtime of grafiekbibliotheek nodig.
export function MonthlyBars({ rows }: { rows: ChartRow[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.revenue ?? 0, r.costs ?? 0]));
  const y = (value: number) => 180 - (value / max) * 155;
  return <svg viewBox="0 0 720 230" className="h-64 w-full" role="img" aria-label="Staafdiagram omzet en kosten per maand">
    {[0, 0.5, 1].map((fraction) => <g key={fraction}><line x1="45" x2="710" y1={y(max * fraction)} y2={y(max * fraction)} stroke="var(--border)" /><text x="38" y={y(max * fraction) + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{compactEur(max * fraction)}</text></g>)}
    {rows.map((r, i) => <g key={r.label}>
      {r.revenue != null && <rect x={58 + i * 54} y={y(Math.max(0, r.revenue))} width="17" height={Math.max(0, 180 - y(Math.max(0, r.revenue)))} fill="var(--success)"><title>{r.label}: omzet {eur(r.revenue)}</title></rect>}
      {r.costs != null && <rect x={77 + i * 54} y={y(Math.max(0, r.costs))} width="17" height={Math.max(0, 180 - y(Math.max(0, r.costs)))} fill="var(--destructive)"><title>{r.label}: kosten {eur(r.costs)}</title></rect>}
      <text x={76 + i * 54} y="200" textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{r.label}</text>
    </g>)}
    <rect x="268" y="215" width="10" height="10" fill="var(--success)" /><text x="283" y="224" fill="var(--foreground)" fontSize="11">Omzet</text>
    <rect x="348" y="215" width="10" height="10" fill="var(--destructive)" /><text x="363" y="224" fill="var(--foreground)" fontSize="11">Kosten</text>
  </svg>;
}

// Stapt naar een rond bedrag (1/2/2,5/5 × 10^n) zodat roosterlijnen en hun labels leesbaar blijven.
function niceStep(span: number) {
  const raw = span / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return ([1, 2, 2.5, 5, 10].find((m) => raw <= m * pow) ?? 10) * pow;
}

export function MonthlyProfit({ rows }: { rows: ChartRow[] }) {
  const values = rows.flatMap((r) => r.profit == null ? [] : [r.profit]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(1, max - min);
  const y = (value: number) => 180 - ((value - min) / span) * 155;
  const zeroY = y(0);
  // Roosterlijnen op mooie ronde bedragen; de nul-lijn krijgt een eigen, duidelijkere lijn.
  const step = niceStep(span);
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const grid = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => (first + i) * step).filter((v) => Math.abs(v) > step / 1000);
  return <svg viewBox="0 0 720 230" className="h-64 w-full" role="img" aria-label="Lijndiagram resultaat per maand">
    {grid.map((v) => <g key={v}><line x1="45" x2="710" y1={y(v)} y2={y(v)} stroke="var(--border)" /><text x="38" y={y(v) + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{compactEur(v)}</text></g>)}
    {/* Nul-lijn duidelijk markeren, zodat een verliesmaand meteen opvalt. */}
    <line x1="45" x2="710" y1={zeroY} y2={zeroY} stroke="var(--muted-foreground)" strokeWidth="1.5" />
    <text x="38" y={zeroY + 4} textAnchor="end" fill="var(--muted-foreground)" fontSize="11" fontWeight="700">0</text>
    {rows.slice(1).map((r, i) => r.profit != null && rows[i]?.profit != null && <line key={r.label} x1={76 + i * 54} y1={y(rows[i].profit as number)} x2={76 + (i + 1) * 54} y2={y(r.profit)} stroke="var(--primary)" strokeWidth="2" />)}
    {rows.map((r, i) => <g key={r.label}>
      {r.profit != null && <circle cx={76 + i * 54} cy={y(r.profit)} r="4" fill="var(--primary)"><title>{r.label}: resultaat {eur(r.profit)}</title></circle>}
      <text x={76 + i * 54} y="200" textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{r.label}</text>
    </g>)}
  </svg>;
}


type FinData = NonNullable<ReturnType<typeof useFinData>["data"]>;

/** Same monthly revenue/costs/result as the Finance year overview (excl. VAT, unknown months stay null). */
export function financeMonthRows(data: FinData, year: number) {
  const deprByMonth = new Map<string, number>();
  for (const i of data.investments) for (const r of depreciationSchedule({ ...i, capitalizable_amount: i.capitalizable_amount == null ? null : Number(i.capitalizable_amount), purchase_amount: i.purchase_amount == null ? null : Number(i.purchase_amount), residual_value: Number(i.residual_value), opening_accumulated: Number(i.opening_accumulated) }))
    deprByMonth.set(r.month, r2((deprByMonth.get(r.month) ?? 0) + r.depreciation));
  const interestByMonth = new Map<string, number>();
  for (const l of data.loans) for (const r of loanSchedule(Number(l.principal), Number(l.annual_rate), l.months, l.start_date))
    interestByMonth.set(r.month, r2((interestByMonth.get(r.month) ?? 0) + r.interest));
  return monthNames.map((label, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    return { label, month, ...summarizeMonth(month, data.E, data.L, { depreciation: deprByMonth.get(month) ?? null, interest: interestByMonth.get(month) ?? null }) };
  });
}
