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
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

/** Whole-year totals per calendar year that has posted lines; the current year runs until today. */
export function yearRows(lines: PostedLine[], until = today()) {
  const years = [...new Set(lines.map((l) => Number(l.entry_date.slice(0, 4))))].filter((y) => `${y}-01-01` <= until).sort();
  return years.map((y) => {
    const from = `${y}-01-01`, end = `${y}-12-31`, to = end < until ? end : until;
    const st = statements(trialBalance(lines.filter((l) => l.entry_date >= from), from, to));
    const revenue = st.opbrengsten, costs = r2(st.kosten + st.belastingen), profit = st.resultaat;
    return { label: to < end ? `${y} (t/m ${to.slice(8, 10)}/${to.slice(5, 7)})` : String(y), year: y, revenue, costs, profit, marge: revenue ? Math.round((profit / revenue) * 100) : null };
  });
}

const eur = (n: number | null | undefined) => (n == null ? "onbekend" : new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n));
const fmt = (n: number | null | undefined) => (n == null ? "–" : new Intl.NumberFormat("nl-BE", { notation: "compact", maximumFractionDigits: 1 }).format(n));

const COST_GROUPS: [string, string[]][] = [
  ["Aankopen (60)", ["60"]],
  ["Diensten & diverse goederen (61)", ["61"]],
  ["Personeel & zaakvoerder (62)", ["62"]],
  ["Afschrijvingen (63)", ["63"]],
  ["Andere bedrijfskosten (64)", ["64"]],
  ["Financiële kosten (65)", ["65"]],
  ["Uitzonderlijk & belastingen (66–67)", ["66", "67"]],
];

/** Monthly cost per account class (debit − credit), capped at today like journalMonthRows. */
export function costGroupRows(lines: PostedLine[], year: number, until = today()) {
  return COST_GROUPS.map(([label, prefixes]) => ({
    label,
    values: monthNames.map((_, i) => {
      const from = `${year}-${String(i + 1).padStart(2, "0")}-01`;
      if (from > until) return null;
      const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
      const to = end < until ? end : until;
      return r2(lines.filter((l) => l.entry_date >= from && l.entry_date <= to && prefixes.some((p) => l.account.startsWith(p))).reduce((s, l) => s + l.debit - l.credit, 0));
    }),
  })).filter((g) => g.values.some((v) => v));
}

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
      return rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit), entry_date: r.fin_journal_entries.entry_date, journal: r.fin_journal_entries.journal, source: r.fin_journal_entries.source }));
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
                {([["Omzet", "revenue"], ["Kosten", "costs"]] as const).map(([l, k]) => (
                  <tr key={k} className="border-b border-border/60"><th className="py-1.5 text-left font-semibold">{l}</th>{rows.map((r) => <td key={r.month} className="py-1.5 text-right tabular-nums">{fmt(r[k])}</td>)}</tr>
                ))}
                {costGroupRows(data, year).map((g) => (
                  <tr key={g.label} className="border-b border-border/40 text-muted-foreground"><th className="py-1 pl-3 text-left font-normal">{g.label}</th>{g.values.map((v, i) => <td key={i} className="py-1 text-right tabular-nums">{fmt(v)}</td>)}</tr>
                ))}
                <tr className="border-b border-border/60"><th className="py-1.5 text-left font-semibold">Resultaat</th>{rows.map((r) => <td key={r.month} className="py-1.5 text-right tabular-nums">{fmt(r.profit)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <YearComparison rows={yearRows(data)} />
          <Link to="/finance" search={{ tab: "overzicht", id: undefined, maand: undefined }} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">Volledig overzicht in Finance →</Link>
        </>}
    </section>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-md border bg-background p-3"><p className="text-xs font-bold uppercase opacity-70">{label}</p><p className={`text-xl font-black ${tone}`}>{value}</p></div>;
}

function YearComparison({ rows }: { rows: ReturnType<typeof yearRows> }) {
  if (rows.length < 2) return null;
  const pct = (a: number, b: number) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);
  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">Vergelijking met vorige jaren</h3>
        <p className="text-xs text-muted-foreground">Volledige jaartotalen uit de boekhouding; het lopende jaar telt tot vandaag.</p>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="year" />
            <YAxis tickFormatter={(v) => fmt(v)} width={48} />
            <Tooltip formatter={(v: number) => eur(v)} />
            <Legend />
            <ReferenceLine y={0} stroke="var(--foreground)" />
            <Bar dataKey="revenue" name="Omzet" fill="var(--success)" />
            <Bar dataKey="costs" name="Kosten" fill="var(--destructive)" />
            <Bar dataKey="profit" name="Resultaat" fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Jaar</th><th className="text-right">Omzet</th><th className="text-right">Kosten</th><th className="text-right">Resultaat</th><th className="text-right">Marge</th><th className="text-right">Omzet t.o.v. vorig jaar</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const d = i ? pct(r.revenue, rows[i - 1]!.revenue) : null;
              return (
                <tr key={r.year} className="border-b border-border/60">
                  <th className="py-1.5 text-left font-semibold">{r.label}</th>
                  <td className="text-right tabular-nums">{eur(r.revenue)}</td>
                  <td className="text-right tabular-nums">{eur(r.costs)}</td>
                  <td className={`text-right tabular-nums ${r.profit < 0 ? "text-destructive" : ""}`}>{eur(r.profit)}</td>
                  <td className="text-right tabular-nums">{r.marge == null ? "–" : `${r.marge}%`}</td>
                  <td className={`text-right tabular-nums ${d == null ? "" : d < 0 ? "text-destructive" : "text-success"}`}>{d == null ? "–" : `${d > 0 ? "+" : ""}${d}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
