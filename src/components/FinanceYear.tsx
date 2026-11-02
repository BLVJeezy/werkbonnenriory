import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { isPrivateCompany, r2 } from "@/lib/finance";
import { monthNames, MonthlyBars, MonthlyProfit } from "@/components/FinanceCharts";
import { fetchAll } from "@/lib/fetch-all";
import { statements, trialBalance, type PostedLine } from "@/lib/boekhouding";

const db = supabase as any;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });

/** Same posted journal lines and statements() as Boekhouding → Balans & resultaat, per month. */
export function journalMonthRows(lines: PostedLine[], year: number, until = today()) {
  return monthNames.map((label, i) => {
    const from = `${year}-${String(i + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
    const to = end < until ? end : until;
    if (from > until) return { label, month: from, revenue: null, costs: null, profit: null };
    const st = statements(trialBalance(lines.filter((l) => l.entry_date >= from), from, to));
    return { label, month: from, revenue: st.opbrengsten, costs: r2(st.kosten + st.belastingen), profit: st.resultaat };
  });
}

const eur = (n: number | null | undefined) => (n == null ? "onbekend" : new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));

/** Boekhouding at a glance: full monthly revenue and costs for one year, same posted journal as Boekhouding → Balans & resultaat. */
export function FinanceYear() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [companyId, setCompanyId] = useState("");
  const companies = useQuery({
    queryKey: ["fin-companies"],
    queryFn: async () => ((await supabase.from("companies").select("*").order("name")).data ?? []).filter((x) => !isPrivateCompany(x.name)),
  });
  useEffect(() => {
    const list = companies.data ?? [];
    if (!companyId && list.length) setCompanyId((list.find((c) => c.name.trim().toLowerCase() === "riory bv") ?? list[0])?.id ?? "");
  }, [companies.data, companyId]);
  const { data, error } = useQuery({
    queryKey: ["fin", "posted", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const rows = (await fetchAll((a, b) => db.from("fin_journal_lines").select("*, fin_journal_entries!inner(entry_date, journal, description, reference, source)").eq("company_id", companyId).range(a, b))) as any[];
      return rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit), entry_date: r.fin_journal_entries.entry_date, journal: r.fin_journal_entries.journal }));
    },
  });

  const rows = data ? journalMonthRows(data, year) : [];
  const sum = (k: "revenue" | "costs" | "profit") => { const v = rows.map((r) => r[k]).filter((x): x is number => x != null); return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null; };
  const omzet = sum("revenue"), kosten = sum("costs"), resultaat = sum("profit");
  const marge = omzet && resultaat != null ? Math.round((resultaat / omzet) * 100) : null;

  return (
    <section className="space-y-4 rounded-md border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black uppercase">Boekhouding {year}</h2>
          <p className="text-xs text-muted-foreground">Geboekte opbrengsten en kosten per maand, excl. btw — gelijk aan Balans & resultaat</p>
        </div>
        <div className="flex items-center gap-2">
          {(companies.data?.length ?? 0) > 1 && (
            <select aria-label="Administratie" className="rounded-md border border-border bg-card px-2 py-1 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Button variant="outline" size="icon" aria-label="Vorig jaar" onClick={() => setYear(year - 1)}><ChevronLeft /></Button>
          <Button variant="outline" size="icon" aria-label="Volgend jaar" onClick={() => setYear(year + 1)}><ChevronRight /></Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">De boekhoudcijfers konden niet worden geladen.</p>
        : !data ? <p className="text-sm text-muted-foreground">Laden…</p>
        : <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Omzet" value={eur(omzet)} tone="text-success" />
            <Kpi label="Kosten" value={eur(kosten)} tone="text-destructive" />
            <Kpi label="Resultaat" value={eur(resultaat)} tone={resultaat != null && resultaat < 0 ? "text-destructive" : "text-primary"} />
            <Kpi label="Marge" value={marge == null ? "onbekend" : `${marge}%`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0"><h3 className="mb-2 text-sm font-semibold">Omzet en kosten per maand</h3><MonthlyBars rows={rows} /></div>
            <div className="min-w-0"><h3 className="mb-2 text-sm font-semibold">Resultaat per maand</h3><MonthlyProfit rows={rows} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5"></th>{rows.map((r) => <th key={r.month} className="py-1.5 text-right font-semibold">{r.label}</th>)}</tr></thead>
              <tbody>
                {([["Omzet", "revenue"], ["Kosten", "costs"], ["Resultaat", "profit"]] as const).map(([l, k]) => (
                  <tr key={k} className="border-b border-border/60"><th className="py-1.5 text-left font-semibold">{l}</th>{rows.map((r) => <td key={r.month} className="py-1.5 text-right tabular-nums">{r[k] == null ? "–" : new Intl.NumberFormat("nl-BE", { notation: "compact", maximumFractionDigits: 1 }).format(r[k] as number)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link to="/finance" search={{ tab: "overzicht", id: undefined, maand: undefined }} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">Volledig overzicht in Finance →</Link>
        </>}
    </section>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-md border bg-background p-3"><p className="text-xs font-bold uppercase opacity-70">{label}</p><p className={`text-xl font-black ${tone}`}>{value}</p></div>;
}
