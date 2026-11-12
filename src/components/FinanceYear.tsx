import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { isPrivateCompany, r2, unbookedDepreciationLines } from "@/lib/finance";
import { rioryCompanies } from "@/lib/finance-company-scope";
import { monthNames, MonthlyBars, MonthlyProfit } from "@/components/FinanceCharts";
import { fetchAll } from "@/lib/fetch-all";
import { statements, trialBalance, type PostedLine } from "@/lib/boekhouding";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dashboardToday, lastClosedMonth } from "@/lib/dashboard-period";

const db = supabase as any;
const today = dashboardToday;

/** Same posted journal lines and statements() as Boekhouding → Balans & resultaat, per month. */
export function journalMonthRows(lines: PostedLine[], year: number, until = today()) {
  const cutoff = lastClosedMonth(until).to;
  return monthNames.map((label, i) => {
    const from = `${year}-${String(i + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
    const to = end;
    if (end > cutoff) return { label, month: from, revenue: null, costs: null, profit: null };
    const st = statements(trialBalance(lines.filter((l) => l.entry_date >= from), from, to));
    return { label, month: from, revenue: st.opbrengsten, costs: r2(st.kosten + st.belastingen), profit: st.resultaat };
  });
}

/** Compare only completed calendar years, never a partial year against a full one. */
export function yearRows(lines: PostedLine[], until = today()) {
  const years = [...new Set(lines.map((l) => Number(l.entry_date.slice(0, 4))))].filter((y) => `${y}-12-31` < until).sort();
  return years.map((y) => {
    const from = `${y}-01-01`, end = `${y}-12-31`, to = end;
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

/** Monthly cost per account class (debit − credit), completed months only. */
export function costGroupRows(lines: PostedLine[], year: number, until = today()) {
  const cutoff = lastClosedMonth(until).to;
  return COST_GROUPS.map(([label, prefixes]) => ({
    label,
    values: monthNames.map((_, i) => {
      const from = `${year}-${String(i + 1).padStart(2, "0")}-01`;
      const end = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10);
      if (end > cutoff) return null;
      const to = end;
      return r2(lines.filter((l) => l.entry_date >= from && l.entry_date <= to && prefixes.some((p) => l.account.startsWith(p))).reduce((s, l) => s + l.debit - l.credit, 0));
    }),
  })).filter((g) => g.values.some((v) => v));
}

/** Boekhouding at a glance: full monthly revenue and costs for one year, same posted journal as Boekhouding → Balans & resultaat. */
export function FinanceYear() {
  const [currentDay, setCurrentDay] = useState(today);
  const cutoff = lastClosedMonth(currentDay).to;
  const latestYear = Number(cutoff.slice(0, 4));
  const [year, setYear] = useState(latestYear);
  useEffect(() => {
    const timer = setInterval(() => setCurrentDay(today()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [companyId, setCompanyId] = useState("");
  const companies = useQuery({
    queryKey: ["fin-companies"],
    queryFn: async () => rioryCompanies((await supabase.from("companies").select("*").ilike("name", "Riory BV").order("name")).data ?? []),
  });
  useEffect(() => {
    const list = companies.data ?? [];
    if (!companyId && list.length) setCompanyId((list.find((c) => c.name.trim().toLowerCase() === "riory bv") ?? list[0])?.id ?? "");
  }, [companies.data, companyId]);
  const { data, error } = useQuery({
    queryKey: ["fin", "posted", companyId, cutoff],
    enabled: !!companyId,
    queryFn: async () => {
      // Maandtotalen per rekening en bron, opgevraagd in de database. Duizenden losse boekingsregels
      // hoeven niet meer één voor één binnen; same posted journaalregels, zelfde statements()-berekening.
      const rows = (await fetchAll((a, b) => db.rpc("fin_journal_summary", { _company: companyId, _until: cutoff }).range(a, b))) as any[];
      const posted = rows.map((r) => ({ entry_date: r.entry_date, account: r.account, source: r.source ?? null, debit: Number(r.debit), credit: Number(r.credit), journal: "" })) as PostedLine[];
      // Afschrijvingen lopen per dag vanaf aankoopdatum; maanden die nog niet geboekt zijn tellen toch mee in de maandkosten.
      const [invs, refs] = await Promise.all([
        fetchAll((a, b) => db.from("fin_investments").select("*").eq("company_id", companyId).order("id").range(a, b)),
        fetchAll((a, b) => db.from("fin_journal_entries").select("id,source_ref").eq("company_id", companyId).eq("source", "afschrijving").order("id").range(a, b)),
      ]) as [any[], any[]];
      const closedYears = new Set(posted.filter((l) => l.source === "jaarafsluiting").map((l) => l.entry_date.slice(0, 4)));
      const planned = unbookedDepreciationLines(invs.map((i) => ({ ...i, capitalizable_amount: i.capitalizable_amount == null ? null : Number(i.capitalizable_amount), purchase_amount: i.purchase_amount == null ? null : Number(i.purchase_amount), useful_life_months: i.useful_life_months == null ? null : Number(i.useful_life_months), residual_value: Number(i.residual_value ?? 0), opening_accumulated: Number(i.opening_accumulated ?? 0) })), new Set(refs.map((r) => String(r.source_ref))), closedYears, cutoff);
      return [...posted, ...planned] as PostedLine[];
    },
  });

  const rows = data ? journalMonthRows(data, year, currentDay) : [];
  const sum = (k: "revenue" | "costs" | "profit") => { const v = rows.map((r) => r[k]).filter((x): x is number => x != null); return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null; };
  const omzet = sum("revenue"), kosten = sum("costs"), resultaat = sum("profit");
  const marge = omzet && resultaat != null ? Math.round((resultaat / omzet) * 100) : null;

  return (
    <section className="space-y-4 rounded-md border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black uppercase">Boekhouding {year}{year === latestYear && cutoff.slice(5) !== "12-31" ? ` t/m ${Number(cutoff.slice(8))}/${Number(cutoff.slice(5, 7))}` : ""}</h2>
          <p className="text-xs text-muted-foreground">Afgesloten maanden · excl. btw · afschrijvingen per dag vanaf aankoopdatum, ook als ze nog niet geboekt zijn</p>
        </div>
        <div className="flex items-center gap-2">
          {(companies.data?.length ?? 0) > 1 && (
            <select aria-label="Administratie" className="rounded-md border border-border bg-card px-2 py-1 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Button variant="outline" size="icon" aria-label="Vorig jaar" onClick={() => setYear(year - 1)}><ChevronLeft /></Button>
          <Button variant="outline" size="icon" aria-label="Volgend jaar" disabled={year >= latestYear} onClick={() => setYear(Math.min(year + 1, latestYear))}><ChevronRight /></Button>
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
                {costGroupRows(data, year, currentDay).map((g) => (
                  <tr key={g.label} className="border-b border-border/40 text-muted-foreground"><th className="py-1 pl-3 text-left font-normal">{g.label}</th>{g.values.map((v, i) => <td key={i} className="py-1 text-right tabular-nums">{fmt(v)}</td>)}</tr>
                ))}
                <tr className="border-b border-border/60"><th className="py-1.5 text-left font-semibold">Resultaat</th>{rows.map((r) => <td key={r.month} className="py-1.5 text-right tabular-nums">{fmt(r.profit)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <YearComparison rows={yearRows(data, currentDay)} />
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
        <p className="text-xs text-muted-foreground">Alleen volledige, afgesloten kalenderjaren.</p>
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
              const previous = rows[i - 1];
              const d = previous && previous.year === r.year - 1 ? pct(r.revenue, previous.revenue) : null;
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
