import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { rioryCompanies } from "@/lib/finance-company-scope";
import { journalWeekRows } from "@/lib/dashboard-week-finance";
import { euro } from "@/lib/billing";
import type { PostedLine } from "@/lib/boekhouding";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function FinanceWeek({ from, to }: { from: string; to: string }) {
  const { data, error } = useQuery({
    queryKey: ["dashboard-week-journal", from, to],
    queryFn: async () => {
      const companies = await supabase.from("companies").select("id, name").ilike("name", "Riory BV").order("id");
      if (companies.error) throw companies.error;
      const company = rioryCompanies(companies.data ?? [])[0];
      if (!company) throw new Error("Riory-administratie ontbreekt");
      const lines = await fetchAll((a, b) => supabase.from("fin_journal_lines")
        .select("id, account, debit, credit, fin_journal_entries!inner(entry_date, journal, source)")
        .eq("company_id", company.id).gte("fin_journal_entries.entry_date", from).lte("fin_journal_entries.entry_date", to)
        .order("id").range(a, b));
      return journalWeekRows(lines.map(l => ({ account: l.account, debit: Number(l.debit), credit: Number(l.credit), ...l.fin_journal_entries })) as PostedLine[], from, to);
    },
  });
  const sum = (key: "revenue" | "costs" | "profit") => data?.reduce((s, r) => s + r[key], 0);
  const revenue = sum("revenue"), profit = sum("profit");
  return <section className="space-y-4 border-b pb-5" aria-label="Weekboekhouding">
    <h2 className="text-lg font-black uppercase">Boekhouding per week</h2>
    <p className="text-xs text-muted-foreground">Afgesloten weken · maandag t/m zondag · excl. btw</p>
    {error ? <p role="alert" className="text-destructive">De weekcijfers konden niet worden geladen.</p> : !data ? <p>Laden…</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Omzet", euro(revenue ?? 0)], ["Kosten", euro(sum("costs") ?? 0)], ["Resultaat", euro(profit ?? 0)], ["Marge", revenue ? `${Math.round((profit ?? 0) / revenue * 100)}%` : "–"]].map(([label, value]) => <div key={label} className="rounded-md border bg-card p-3"><p className="text-xs font-bold uppercase opacity-70">{label}</p><p className="text-xl font-black">{value}</p></div>)}
      </div>
      <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis width={70} tickFormatter={v => `€${Math.round(v)}`} /><Tooltip labelFormatter={(_, payload) => payload[0]?.payload?.period ?? ""} formatter={v => euro(Number(v))} /><Legend /><Bar dataKey="revenue" name="Omzet" fill="var(--success)" /><Bar dataKey="costs" name="Kosten" fill="var(--destructive)" /><Bar dataKey="profit" name="Resultaat" fill="var(--primary)" /></BarChart></ResponsiveContainer></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="py-2 text-left">Week / periode</th><th className="text-right">Omzet</th><th className="text-right">Kosten</th><th className="text-right">Resultaat</th></tr></thead><tbody>{data.map(row => <tr key={row.key} className="border-b"><th className="py-2 text-left font-normal whitespace-nowrap">{row.label}<span className="block text-xs text-muted-foreground">{row.period}</span></th><td className="text-right whitespace-nowrap">{euro(row.revenue)}</td><td className="text-right whitespace-nowrap">{euro(row.costs)}</td><td className="text-right whitespace-nowrap">{euro(row.profit)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}