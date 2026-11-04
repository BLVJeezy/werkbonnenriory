import { VAT_RATES, detectVatRate, vatFor, vatSide, type VatRate } from "@/lib/vat-rate";
import { FinanceTasks } from "@/components/FinanceTasks";
import { useFinanceSales } from "@/lib/use-finance-sales";
import { syncFinancePurchases } from "@/lib/finance-purchases.functions";
import { pontoStatus } from "@/lib/ponto.functions";
import { unapproveInvoice } from "@/lib/undo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFinanceAuth as useAuth } from "@/lib/finance-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import {
  addMonths, dedupeKey, depreciationSchedule, isPrivateCompany, keywordFrom, loanSchedule, monthKey, normSupplier,
  parseAmount, r2, depreciationByYear, type DeprRow, signedAmount, suggest, summarizeMonth, type Entry, type InvLine, type Rule,
} from "@/lib/finance";
import { syncFinanceTasks } from "@/lib/finance-tasks";
import { validateInvestment, validateLoan } from "@/lib/finance";
import { useServerFn } from "@tanstack/react-start";
import { fetchNbbAccounts, parseAccountsPdf } from "@/lib/nbb.functions";
import { normalizeEnterpriseNumber } from "@/lib/nbb";
import { useFinData, MonthlyBars, MonthlyProfit, monthNames } from "@/components/FinanceCharts";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({
    meta: [
      { title: "Finance — Riory Werkbonnen" },
      { name: "description", content: "Financieel overzicht per bedrijf: resultaat, budget, facturen, investeringen en leningen." },
      { property: "og:title", content: "Finance — Riory Werkbonnen" },
      { property: "og:description", content: "Financieel overzicht per bedrijf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ tab: (s["tab"] as string) || "overzicht", id: s["id"] as string | undefined, maand: s["maand"] as string | undefined }),
  component: Finance,
});

const TABS = ["overzicht", "invoer", "budget", "facturen", "regels", "investeringen", "leningen", "concurrenten", "koppelingen"] as const;
const eur = (n: number | null | undefined) => (n == null ? "onbekend" : new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n));
const db = supabase as any;

function Finance() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("");
  const [month, setMonth] = useState(search.maand ?? addMonths(monthKey(new Date()), -1));
  const [year, setYear] = useState(Number((search.maand ?? monthKey(new Date())).slice(0, 4)));
  useEffect(() => { if (!loading && !user) nav({ to: "/werkbonnen" }); }, [loading, user, nav]);

  const companies = useQuery({ queryKey: ["fin-companies"], enabled: !!user, queryFn: async () => ((await supabase.from("companies").select("*").order("name")).data ?? []).filter((x) => !isPrivateCompany(x.name)) });
  useEffect(() => { if (!companyId && companies.data?.length) setCompanyId(companies.data[0]?.id ?? ""); }, [companies.data, companyId]);
  const company = companies.data?.find((c) => c.id === companyId);
  useFinanceSales(!!user && company?.name.trim().toLowerCase() === "riory bv");

  useEffect(() => {
    if (!company) return;
    syncFinanceTasks(company.id).then((r) => { if (r.created || r.resolved) toast.info(`Finance: ${r.created} nieuwe taak/taken, ${r.resolved} automatisch afgesloten`); qc.invalidateQueries({ queryKey: ["fin", "tasks"] }); }).catch(() => toast.error("Financetaken konden niet geëvalueerd worden (leesfout) — er is niets gewijzigd."));
  }, [company]);

  const syncPurchasesAuto = useServerFn(syncFinancePurchases);
  useEffect(() => {
    if (!company?.simpla_bound) return;
    let stop = false;
    (async () => {
      const { data: st } = await db.from("fin_sync_status").select("last_success_at").eq("company_id", company.id).eq("source", "simpla").maybeSingle();
      const last = st?.last_success_at ? new Date(st.last_success_at).getTime() : 0;
      if (Date.now() - last < 30 * 60_000 || stop) return;
      const r = await runSimplaImport(company.id, syncPurchasesAuto).catch(() => null);
      if (r?.ok && r.n) { toast.success(`${r.n} nieuwe Simpla-aankoopfacturen automatisch opgehaald`); qc.invalidateQueries({ queryKey: ["fin"] }); }
    })();
    return () => { stop = true; };
  }, [company?.id, company?.simpla_bound]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { qc.invalidateQueries({ queryKey: ["fin"] }); if (company) syncFinanceTasks(company.id).catch(() => toast.error("Financetaken niet bijgewerkt (leesfout)")); };
  const setTab = (tab: string) => nav({ to: "/finance", search: { tab, id: undefined, maand: undefined } });

  if (loading) return <p className="text-sm text-muted-foreground">Laden…</p>;
  if (!user) return <p className="text-sm text-destructive">Alleen voor beheerder.</p>;
  return (
    <div className="min-w-0 overflow-x-clip bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/werkbonnen"><Button variant="outline" size="sm"><ArrowLeft className="mr-1 size-4" />Taken</Button></Link>
          <Link to="/boekhouding" search={{ tab: "rekeningen" }}><Button variant="outline" size="sm">Boekhouding</Button></Link>
          <h1 className="text-xl font-bold">Finance</h1>
          <select className="rounded-md border border-border bg-card px-2 py-1 text-sm" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={async () => {
            const n = prompt("Naam nieuw bedrijf"); if (!n) return;
            await supabase.from("companies").insert({ name: n }); qc.invalidateQueries({ queryKey: ["fin-companies"] });
          }}>+ bedrijf</Button>
          {search.tab === "overzicht" ? <select aria-label="Jaar" className="rounded-md border border-border bg-card px-2 py-1 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: Math.max(5, new Date().getFullYear() - 2025 + 2) }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select> : <Input type="month" aria-label="Maand" className="w-40" value={month.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value + "-01")} />}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map((t) => <Button key={t} size="sm" variant={search.tab === t ? "default" : "outline"} onClick={() => setTab(t)} className="capitalize">{t}</Button>)}
        </div>
        {company && search.tab === "overzicht" && <FinanceTasks companyId={company.id} />}
        {company && (
          <>
            {search.tab === "overzicht" && <Overzicht c={company.id} year={year} />}
            {search.tab === "invoer" && <Invoer c={company.id} month={month} onDone={refresh} />}
            {search.tab === "budget" && <Budget c={company.id} month={month} onDone={refresh} />}
            {search.tab === "facturen" && <Facturen c={company.id} focus={search.id} onDone={refresh} />}
            {search.tab === "regels" && <Regels c={company.id} />}
            {search.tab === "investeringen" && <Investeringen c={company.id} focus={search.id} onDone={refresh} />}
            {search.tab === "leningen" && <Leningen c={company.id} />}
            {search.tab === "concurrenten" && <Concurrenten />}
            {search.tab === "koppelingen" && <Koppelingen c={company.id} bound={!!company.simpla_bound} onDone={() => { qc.invalidateQueries({ queryKey: ["fin-companies"] }); refresh(); }} />}
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-4"><p className="mb-2 text-sm font-semibold">{title}</p>{children}</div>;
}


function LopendeAfschrijvingen({ investments }: { investments: any[] }) {
  const now = monthKey(new Date());
  const rows = investments.map((i) => {
    const sched = depreciationSchedule({ ...i, capitalizable_amount: i.capitalizable_amount == null ? null : Number(i.capitalizable_amount), purchase_amount: i.purchase_amount == null ? null : Number(i.purchase_amount), residual_value: Number(i.residual_value), opening_accumulated: Number(i.opening_accumulated) });
    const rest = sched.filter((r) => r.month >= now);
    if (!rest.length) return null;
    return { id: i.id, name: i.name, monthly: rest[0]?.depreciation ?? 0, until: rest.at(-1)?.month ?? "", remaining: r2(rest.reduce((s, r) => s + r.depreciation, 0)), bookValue: rest.at(-1)?.bookValue ?? 0 };
  }).filter((r): r is NonNullable<typeof r> => r != null).sort((a, b) => b.monthly - a.monthly);
  if (!rows.length) return null;
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Lopende afschrijvingen <span className="font-normal text-muted-foreground">({rows.length} investeringen · {eur(r2(rows.reduce((s, r) => s + r.monthly, 0)))} per maand · nog {eur(r2(rows.reduce((s, r) => s + r.remaining, 0)))} af te schrijven)</span></h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2">Investering</th><th className="py-2 text-right">Per maand</th><th className="py-2 text-right">Nog af te schrijven</th><th className="py-2 text-right">Loopt tot</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id} className="border-b border-border/60"><th className="py-1.5 text-left font-medium">{r.name}</th><td className="py-1.5 text-right">{eur(r.monthly)}</td><td className="py-1.5 text-right">{eur(r.remaining)}</td><td className="py-1.5 text-right">{r.until.slice(0, 7)}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

function Overzicht({ c, year }: { c: string; year: number }) {
  const { data, error } = useFinData(c);
  const qc = useQueryClient();
  if (error) return <p className="text-sm text-destructive">Het jaaroverzicht kon niet worden geladen.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Laden…</p>;
  const deprByMonth = new Map<string, number>();
  for (const i of data.investments) for (const r of depreciationSchedule({ ...i, capitalizable_amount: i.capitalizable_amount == null ? null : Number(i.capitalizable_amount), purchase_amount: i.purchase_amount == null ? null : Number(i.purchase_amount), residual_value: Number(i.residual_value), opening_accumulated: Number(i.opening_accumulated) }))
    deprByMonth.set(r.month, r2((deprByMonth.get(r.month) ?? 0) + r.depreciation));
  const interestByMonth = new Map<string, number>();
  for (const l of data.loans) for (const r of loanSchedule(Number(l.principal), Number(l.annual_rate), l.months, l.start_date))
    interestByMonth.set(r.month, r2((interestByMonth.get(r.month) ?? 0) + r.interest));
  const rows = monthNames.map((label, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const summary = summarizeMonth(month, data.E, data.L, { depreciation: deprByMonth.get(month) ?? null, interest: interestByMonth.get(month) ?? null });
    const budgets = data.budgets.filter((b: any) => b.month === month);
    return { label, month, ...summary, budget: budgets.length ? r2(budgets.reduce((sum: number, b: any) => sum + Number(b.amount), 0)) : null,
      cashBudget: budgets.length ? r2(budgets.filter((b: any) => !/afschrijv/i.test(String(b.category))).reduce((sum: number, b: any) => sum + Number(b.amount), 0)) : null,
      complete: data.months.find((x: any) => x.month === month) };
  });
  const total = (key: "revenue" | "costs" | "profit" | "depreciation" | "interest" | "budget") => {
    const values = rows.map((r) => r[key]).filter((v): v is number => v != null);
    return values.length ? r2(values.reduce((a, b) => a + b, 0)) : null;
  };
  const known = (key: "revenue" | "costs" | "profit") => rows.filter((r) => r[key] != null).length;
  const lastCash = rows.filter((r) => r.cash != null).at(-1);
  const toggle = async (month: string, k: "revenue_complete" | "costs_complete" | "bank_complete") => {
    const m = data.months.find((x: any) => x.month === month);
    const { error: saveError } = m
      ? await db.from("fin_months").update({ [k]: !m[k] }).eq("id", m.id).eq("company_id", c)
      : await db.from("fin_months").insert({ company_id: c, month, [k]: true });
    if (saveError) return void toast.error("Volledigheid kon niet worden opgeslagen");
    qc.invalidateQueries({ queryKey: ["fin"] });
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">Jaaroverzicht {year}</h2><p className="text-xs text-muted-foreground">Bedragen excl. btw · onbekende maanden tellen niet als nul</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Omzet"><p className="text-2xl font-bold">{eur(total("revenue"))}</p><p className="text-xs text-muted-foreground">{known("revenue")} van 12 maanden bekend</p></Card>
        <Card title="Kosten"><p className="text-2xl font-bold">{eur(total("costs"))}</p><p className="text-xs text-muted-foreground">{known("costs")} van 12 maanden bekend · excl. investeringen</p></Card>
        <Card title="Resultaat"><p className="text-2xl font-bold">{eur(total("profit"))}</p><p className="text-xs text-muted-foreground">{known("profit")} van 12 maanden berekend</p></Card>
        <Card title="Laatst bekend kassaldo"><p className="text-2xl font-bold">{eur(lastCash?.cash)}</p><p className="text-xs text-muted-foreground">{lastCash ? lastCash.label + " " + year : "Geen kassaldo ingevoerd"}</p></Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="min-w-0"><h3 className="mb-3 text-sm font-semibold">Omzet en kosten per maand</h3><MonthlyBars rows={rows} /></section>
        <section className="min-w-0"><h3 className="mb-3 text-sm font-semibold">Resultaat per maand</h3><MonthlyProfit rows={rows} /></section>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2">Maand</th><th className="py-2 text-right">Omzet</th><th className="py-2 text-right">Kosten</th><th className="py-2 text-right">Resultaat</th><th className="py-2 text-right">Budget</th><th className="py-2 text-right" title="Budget zonder afschrijvingen: wat er echt van je rekening gaat">Echte uitgaven</th><th className="py-2 text-right">Kassaldo</th><th className="py-2 text-right">Volledig: omzet / kosten / bank</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.month} className="border-b border-border/60"><th className="py-2 text-left font-medium">{r.label}</th><td className="py-2 text-right">{eur(r.revenue)}</td><td className="py-2 text-right">{eur(r.costs)}</td><td className="py-2 text-right">{eur(r.profit)}</td><td className="py-2 text-right">{eur(r.budget)}</td><td className="py-2 text-right">{eur(r.cashBudget)}</td><td className="py-2 text-right">{eur(r.cash)}</td><td className="py-2 text-right">{(["revenue_complete", "costs_complete", "bank_complete"] as const).map((k) => <label key={k} className="relative ml-2 inline-flex items-center gap-1"><input type="checkbox" aria-label={`${r.label} ${k === "revenue_complete" ? "omzet" : k === "costs_complete" ? "kosten" : "bank"} volledig`} checked={!!r.complete?.[k]} onChange={() => toggle(r.month, k)} /><span className="sr-only">{k}</span></label>)}</td></tr>)}
      </tbody></table></div>
      <p className="text-xs text-muted-foreground">"Echte uitgaven" = budget zonder afschrijvingen: het geld dat elke maand echt van je rekening gaat (lening-aflossingen tellen wel mee, want die betaal je echt).</p>
      <LopendeAfschrijvingen investments={data.investments} />
      <p className="text-xs text-muted-foreground">Afschrijving {eur(total("depreciation"))} · interest {eur(total("interest"))} (alleen waar niet al geboekt) · {rows.reduce((n, r) => n + r.unapprovedLines, 0)} factuurlijnen nog niet goedgekeurd · {rows.reduce((n, r) => n + r.excludedInvoiceLines, 0)} uitgesloten wegens handmatig totaal.</p>
    </div>
  );
}

const COLS = ["datum", "omschrijving", "categorie", "rekening", "bedrag", "debet", "credit", "referentie"] as const;

function Invoer({ c, month, onDone }: { c: string; month: string; onDone: () => void }) {
  const [f, setF] = useState({ kind: "kost", category: "", account: "", amount: "", level: "totaal", description: "" });
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [map, setMap] = useState<any>({});
  const [imp, setImp] = useState({ kind: "kost", level: "detail", file: "" });
  const headers = rows.length ? Object.keys(rows[0] ?? {}) : [];
  const preview = useMemo(() => rows.map((r) => {
    const d = map.datum ? String(r[map.datum] ?? "") : month;
    const iso = /^\d{2}[/-]\d{2}[/-]\d{4}$/.test(d) ? `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : d;
    const amount = signedAmount(imp.kind as any, map.debet ? parseAmount(r[map.debet]) : null, map.credit ? parseAmount(r[map.credit]) : null, map.bedrag ? parseAmount(r[map.bedrag]) : null);
    const err = !/^\d{4}-\d{2}/.test(iso) ? "datum ongeldig" : amount == null ? "bedrag ontbreekt" : "";
    return { month: err ? "" : monthKey(iso), description: map.omschrijving ? String(r[map.omschrijving] ?? "") : null, category: (map.categorie && String(r[map.categorie] ?? "")) || "algemeen", account: map.rekening ? String(r[map.rekening] ?? "") || null : null, amount, ref: map.referentie ? String(r[map.referentie] ?? "") : "", err };
  }), [rows, map, imp.kind, month]);

  const add = async () => {
    const amount = parseAmount(f.amount);
    if (amount == null || !f.category) return void toast.error("Categorie en bedrag zijn verplicht");
    const { error } = await db.from("fin_entries").insert({ company_id: c, month, kind: f.kind, category: f.category, account: f.account || null, amount, level: f.level, description: f.description || null, source: "handmatig", dedupe_key: dedupeKey(["handmatig", f.kind, month, f.category, f.level]) });
    if (error?.code === "23505") toast.error("Er bestaat al een handmatige regel voor deze maand/categorie/niveau — pas die aan of verwijder ze eerst.");
    else if (error) toast.error("Opslaan mislukt"); else { toast.success("Opgeslagen"); onDone(); }
  };
  const doImport = async () => {
    const ok = preview.filter((p) => !p.err);
    const payload = ok.map((p, i) => ({ company_id: c, month: p.month, kind: imp.kind, category: p.category, account: p.account, amount: p.amount, level: imp.level, description: p.description, source: `import:${imp.file}`, source_ref: p.ref || String(i + 1), dedupe_key: dedupeKey(["import", imp.kind, p.month, p.ref || `${p.description}|${p.amount}|${p.account}`]) }));
    const { error, count } = await db.from("fin_entries").upsert(payload, { onConflict: "company_id,dedupe_key", ignoreDuplicates: true, count: "exact" });
    if (error) return void toast.error("Import mislukt");
    toast.success(`${count ?? 0} nieuwe regels, ${ok.length - (count ?? 0)} dubbels overgeslagen, ${preview.length - ok.length} ongeldig`);
    setRows([]); onDone();
  };
  const entries = useFinData(c).data?.E.filter((e) => e.month === month) ?? [];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title={`Handmatige invoer ${month.slice(0, 7)}`}>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="rounded border border-border bg-background p-2 text-sm" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="omzet">Omzet</option><option value="kost">Kost</option><option value="kas">Kassaldo</option></select>
          <select className="rounded border border-border bg-background p-2 text-sm" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="totaal">Maandtotaal</option><option value="detail">Detailregel</option></select>
          <Input placeholder="Categorie (bv. Huur)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <Input placeholder="Rekening (bv. 611120)" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} />
          <Input placeholder="Bedrag excl. btw" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Input placeholder="Omschrijving" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <Button className="mt-2" size="sm" onClick={add}>Toevoegen</Button>
        <p className="mt-2 text-xs text-muted-foreground">Een maandtotaal voor een categorie vervangt detailregels en goedgekeurde facturen van die categorie in het overzicht (geen dubbeltelling).</p>
        <ul className="mt-3 space-y-1 text-xs">
          {entries.map((e: any) => <li key={e.id} className="flex justify-between gap-2"><span>{e.kind} · {e.category} · {e.level} · {e.source}</span><span>{eur(e.amount)} <Button variant="ghost" className="text-destructive" onClick={async () => { await db.from("fin_entries").delete().eq("id", e.id); onDone(); }}>×</Button></span></li>)}
        </ul>
      </Card>
      <Card title="Import CSV / XLSX">
        <input type="file" accept=".csv,.xlsx,.xls" className="text-sm" onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
          setRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0] ?? ""] ?? {}, { defval: "", raw: false }));
          setImp({ ...imp, file: file.name }); setMap({});
        }} />
        {rows.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select className="rounded border border-border bg-background p-1 text-sm" value={imp.kind} onChange={(e) => setImp({ ...imp, kind: e.target.value })}><option value="kost">Kosten</option><option value="omzet">Omzet</option><option value="kas">Bank/kas</option></select>
              <select className="rounded border border-border bg-background p-1 text-sm" value={imp.level} onChange={(e) => setImp({ ...imp, level: e.target.value })}><option value="detail">Grootboekdetail</option><option value="totaal">Samenvattende totalen</option></select>
              {COLS.map((k) => (
                <label key={k} className="text-xs">{k}<select className="w-full rounded border border-border bg-background p-1" value={map[k] ?? ""} onChange={(e) => setMap({ ...map, [k]: e.target.value })}><option value="">—</option>{headers.map((h) => <option key={h}>{h}</option>)}</select></label>
              ))}
            </div>
            <div className="max-h-60 overflow-auto text-xs">
              {preview.slice(0, 50).map((p, i) => <div key={i} className={p.err ? "text-destructive" : ""}>{p.month.slice(0, 7)} · {p.category} · {p.description} · {eur(p.amount)} {p.err}</div>)}
            </div>
            <Button size="sm" onClick={doImport}>Importeren ({preview.filter((p) => !p.err).length} geldig)</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Budget({ c, month, onDone }: { c: string; month: string; onDone: () => void }) {
  const { data } = useFinData(c);
  const [cat, setCat] = useState(""); const [amt, setAmt] = useState("");
  const rows = data?.budgets.filter((b: any) => b.month === month) ?? [];
  return (
    <Card title={`Budget ${month.slice(0, 7)}`}>
      <div className="flex flex-wrap gap-2">
        <Input className="w-48" placeholder="Categorie" value={cat} onChange={(e) => setCat(e.target.value)} />
        <Input className="w-32" placeholder="Bedrag" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <Button size="sm" onClick={async () => { const a = parseAmount(amt); if (!cat || a == null) return; await db.from("fin_budgets").upsert({ company_id: c, month, category: cat, amount: a }, { onConflict: "company_id,month,category" }); setCat(""); setAmt(""); onDone(); }}>Opslaan</Button>
      </div>
      <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Categorie</th><th className="py-1 text-right">Budget</th><th className="py-1 text-right">Werkelijk</th><th className="py-1 text-right">Verschil (budget − werkelijk)</th><th /></tr></thead><tbody>
        {rows.map((b: any) => {
          const s = summarizeMonth(month, (data?.E ?? []).filter((e) => e.category === b.category), (data?.L ?? []).filter((l) => l.category === b.category));
          return <tr key={b.id} className="border-t border-border"><td>{b.category}</td><td className="text-right">{eur(Number(b.amount))}</td><td className="text-right">{eur(s.costs)}</td><td className="text-right">{s.costs == null ? "onbekend" : eur(r2(Number(b.amount) - s.costs))}</td><td><Button variant="ghost" className="text-destructive" onClick={async () => { await db.from("fin_budgets").delete().eq("id", b.id); onDone(); }}>×</Button></td></tr>;
        })}
      </tbody></table>
      {!rows.length && <p className="mt-2 text-xs text-muted-foreground">Geen budgetposten voor deze maand — zie het jaaroverzicht hieronder.</p>}
      <BudgetJaar budgets={data?.budgets ?? []} year={month.slice(0, 4)} data={data} />
    </Card>
  );
}

function BudgetJaar({ budgets, year, data }: { budgets: any[]; year: string; data?: any }) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`);
  const yb = budgets.filter((b) => String(b.month).startsWith(year));
  const cats = [...new Set(yb.map((b) => String(b.category)))].sort((a, b) => a.localeCompare(b, "nl"));
  const hasB = (m: string) => yb.some((b) => b.month === m);
  const act = (cat: string, m: string) => (data ? summarizeMonth(m, data.E.filter((e: any) => e.category === cat), data.L.filter((l: any) => l.category === cat)).costs ?? 0 : 0);
  // Maanden zonder budget tonen de werkelijke kosten van die post (cursief), zodat het hele jaar gevuld is.
  const val = (cat: string, m: string) => (hasB(m) ? yb.filter((b) => b.category === cat && b.month === m).reduce((s, b) => s + Number(b.amount), 0) : act(cat, m));
  if (!cats.length) return <p className="mt-4 text-sm text-muted-foreground">Nog geen budgetposten in {year}.</p>;
  const short = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const fmt = (n: number) => (n ? Math.round(n).toLocaleString("nl-BE") : "–");
  return (
    <div className="mt-6">
      <p className="mb-1 text-sm font-semibold">Budget {year} per categorie</p>
      <p className="mb-2 text-xs text-muted-foreground">Gewone cijfers = budget. Grijze schuine cijfers = werkelijke kosten in maanden zonder budget.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead><tr className="text-muted-foreground"><th className="sticky left-0 bg-card py-1 pr-2 text-left">Categorie</th>{short.map((s) => <th key={s} className="px-1 text-right">{s}</th>)}<th className="px-1 text-right">Totaal</th></tr></thead>
          <tbody>
            {cats.map((cat) => {
              const vs = months.map((m) => val(cat, m));
              return <tr key={cat} className="border-t border-border"><td className="sticky left-0 bg-card py-1 pr-2">{cat}</td>{vs.map((v, i) => <td key={i} className={`px-1 text-right ${hasB(months[i] ?? "") ? "" : "italic text-muted-foreground"}`}>{fmt(v)}</td>)}<td className="px-1 text-right font-medium">{fmt(vs.reduce((a, b) => a + b, 0))}</td></tr>;
            })}
            <tr className="border-t-2 border-border font-semibold"><td className="sticky left-0 bg-card py-1 pr-2">Totaal</td>{months.map((m) => <td key={m} className={`px-1 text-right ${hasB(m) ? "" : "italic text-muted-foreground"}`}>{fmt(cats.reduce((s, c) => s + val(c, m), 0))}</td>)}<td className="px-1 text-right">{fmt(months.reduce((t, m) => t + cats.reduce((s, c) => s + val(c, m), 0), 0))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useRules(c: string) {
  return useQuery({ queryKey: ["fin", "rules", c], queryFn: async () => ((await db.from("fin_rules").select("*").eq("company_id", c)).data ?? []) as Rule[] });
}

/** Vult lege factuurlijnen aan met aangeleerde regels. Simpla-facturen (in Simpla al goedgekeurd)
 *  waarvan elke lijn een rekening kreeg, worden goedgekeurd zodat ze geboekt kunnen worden. */
async function applyLearnedRules(c: string) {
  const rules = ((await db.from("fin_rules").select("*").eq("company_id", c)).data ?? []) as Rule[];
  const inv = (await fetchAll((a, b) => db.from("fin_invoices").select("id, counterparty, source, fin_invoice_lines(id, description, account, category)").eq("company_id", c).eq("review_status", "te_beoordelen").order("id").range(a, b))) as any[];
  let filled = 0, approved = 0;
  for (const i of inv) {
    let complete = i.fin_invoice_lines.length > 0;
    for (const l of i.fin_invoice_lines) {
      if (l.account && l.category) continue;
      const sg = suggest(rules, i.counterparty, l.description);
      if (!sg) { complete = false; continue; }
      const { error } = await db.from("fin_invoice_lines").update({ account: sg.account, category: sg.category, confidence: sg.confidence, suggestion_rule_id: sg.ruleId }).eq("id", l.id);
      if (error) { complete = false; continue; }
      filled++;
    }
    if (complete && i.source === "simpla") {
      const { error } = await db.from("fin_invoices").update({ review_status: "goedgekeurd" }).eq("id", i.id);
      if (!error) { approved++; await db.from("fin_audit").insert({ company_id: c, entity: "factuur", entity_id: i.id, action: "goedgekeurd", detail: { via: "aangeleerde regel" } }); }
    }
  }
  return { filled, approved, open: inv.length - approved };
}

function Facturen({ c, focus, onDone }: { c: string; focus?: string | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const rules = useRules(c).data ?? [];
  const [query, setQuery] = useState("");
  const [todo, setTodo] = useState(true);
  const [pick, setPick] = useState<Record<string, string>>({});
  const { data: accounts = [] } = useQuery({ queryKey: ["fin", "accounts", c], queryFn: async () => (await fetchAll((a, b) => db.from("fin_accounts").select("*").eq("company_id", c).order("number").range(a, b))) as any[] });
  const [applying, setApplying] = useState(false);
  const runRules = async () => {
    setApplying(true);
    try { const r = await applyLearnedRules(c); toast.success(`${r.filled} lijn(en) automatisch ingedeeld, ${r.approved} factuur/facturen goedgekeurd. ${r.open} blijven ter beoordeling.`); }
    catch { toast.error("Regels toepassen mislukt"); }
    setApplying(false); qc.invalidateQueries({ queryKey: ["fin"] }); onDone();
  };
  const { data: inv = [] } = useQuery({ queryKey: ["fin", "inv", c], queryFn: () => fetchAll<any>((a, b) => db.from("fin_invoices").select("*, fin_invoice_lines(*)").eq("company_id", c).order("invoice_date", { ascending: false }).order("id").range(a, b)) });
  const matches = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase("nl-BE").split(/\s+/).filter(Boolean);
    const base = todo ? inv.filter((i: any) => i.review_status === "te_beoordelen") : inv;
    if (!terms.length) return base;
    return base.filter((i: any) => {
      const haystack = [i.counterparty, i.number, i.invoice_date, i.source_ref, ...(i.fin_invoice_lines ?? []).map((l: any) => l.description)].filter(Boolean).join(" ").toLocaleLowerCase("nl-BE");
      return terms.every((term) => haystack.includes(term));
    });
  }, [inv, query, todo]);
  const [sel, setSel] = useState<string | undefined>(focus);
  const [n, setN] = useState({ direction: "aankoop", doc_type: "factuur", counterparty: "", number: "", invoice_date: "", due_date: "", description: "", ex_vat: "", vat: "", original: "" });
  const create = async () => {
    const ex = parseAmount(n.ex_vat); if (ex == null || !n.invoice_date) return void toast.error("Datum en bedrag excl. btw verplicht");
    const { data: i, error } = await db.from("fin_invoices").insert({ company_id: c, direction: n.direction, doc_type: n.doc_type, counterparty: n.counterparty, number: n.number, invoice_date: n.invoice_date, due_date: n.due_date || null, original_invoice_id: n.original || null, source: "handmatig", source_ref: crypto.randomUUID() }).select().single();
    if (error) return void toast.error(`Opslaan mislukt: ${error.message}`);
    const sg = suggest(rules, n.counterparty, n.description);
    await db.from("fin_invoice_lines").insert({ invoice_id: i.id, description: n.description, ex_vat: Math.abs(ex), vat: Math.abs(parseAmount(n.vat) ?? 0), account: sg?.account ?? null, category: sg?.category ?? null, suggestion_rule_id: sg?.ruleId ?? null, confidence: sg?.confidence ?? null });
    setSel(i.id); qc.invalidateQueries({ queryKey: ["fin"] }); onDone();
  };
  const cur = inv.find((i: any) => i.id === sel);
  const quickBook = async (i: any) => {
    const nr = String(i._nr ?? pick[i.id] ?? "").trim();
    const acc = accounts.find((a: any) => a.number === nr && a.active);
    if (!acc) return void toast.error("Kies een bestaande grootboekrekening");
    for (const l of i.fin_invoice_lines ?? []) {
      if (l.account && l.category) continue;
      const { error } = await db.from("fin_invoice_lines").update({ account: l.account || acc.number, category: l.category || acc.name }).eq("id", l.id);
      if (error) return void toast.error(`Opslaan mislukt: ${error.message}`);
    }
    const { error } = await db.from("fin_invoices").update({ review_status: "goedgekeurd" }).eq("id", i.id);
    if (error) return void toast.error(`Goedkeuren mislukt: ${error.message}`);
    await db.from("fin_audit").insert({ company_id: c, entity: "factuur", entity_id: i.id, action: "snel_ingeboekt", detail: { account: acc.number } });
    toast.success(`${i.counterparty ?? "Factuur"} ingeboekt op ${acc.number}`);
    qc.invalidateQueries({ queryKey: ["fin"] }); onDone();
  };
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-3">
        <Card title="Aangeleerde boekingsregels">
          <p className="text-sm">{inv.filter((i: any) => i.review_status === "te_beoordelen").length} factuur/facturen ter beoordeling. Vul ze automatisch aan met wat de app leerde uit het dagboek van je boekhouder; Simpla-facturen die volledig ingedeeld raken, worden goedgekeurd en kunnen in Boekhouding geboekt worden.</p>
          <Button size="sm" className="mt-2" disabled={applying} onClick={runRules}>{applying ? "Bezig…" : "Regels toepassen"}</Button>
        </Card>
        <Card title="Nieuwe factuur / creditnota">
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="rounded border border-border bg-background p-2 text-sm" value={n.direction} onChange={(e) => setN({ ...n, direction: e.target.value })}><option value="aankoop">Aankoop</option><option value="verkoop">Verkoop</option></select>
            <select className="rounded border border-border bg-background p-2 text-sm" value={n.doc_type} onChange={(e) => setN({ ...n, doc_type: e.target.value })}><option value="factuur">Factuur</option><option value="creditnota">Creditnota</option></select>
            <Input placeholder="Leverancier/klant" value={n.counterparty} onChange={(e) => setN({ ...n, counterparty: e.target.value })} />
            <Input placeholder="Nummer" value={n.number} onChange={(e) => setN({ ...n, number: e.target.value })} />
            <label className="text-xs">Datum<Input type="date" value={n.invoice_date} onChange={(e) => setN({ ...n, invoice_date: e.target.value })} /></label>
            <label className="text-xs">Vervaldatum<Input type="date" value={n.due_date} onChange={(e) => setN({ ...n, due_date: e.target.value })} /></label>
            <Input placeholder="Omschrijving lijn" value={n.description} onChange={(e) => setN({ ...n, description: e.target.value })} />
            <Input placeholder="Excl. btw" value={n.ex_vat} onChange={(e) => setN({ ...n, ex_vat: e.target.value })} />
            <Input placeholder="Btw" value={n.vat} onChange={(e) => setN({ ...n, vat: e.target.value })} />
            {n.doc_type === "creditnota" && <select className="rounded border border-border bg-background p-2 text-sm" value={n.original} onChange={(e) => setN({ ...n, original: e.target.value })}><option value="">Oorspronkelijke factuur…</option>{inv.filter((i: any) => i.doc_type === "factuur").map((i: any) => <option key={i.id} value={i.id}>{i.counterparty} {i.number}</option>)}</select>}
          </div>
          <Button size="sm" className="mt-2" onClick={create}>Aanmaken</Button>
        </Card>
        <div className="relative">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Facturen zoeken" placeholder="Zoek factuur, leverancier, nummer of datum" className="pl-9 pr-9" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" aria-label="Zoekopdracht wissen" onClick={() => setQuery("")}><X className="size-4" /></Button>}
        </div>
        <div className="flex gap-1" role="group" aria-label="Facturen tonen">
          <Button size="sm" variant={todo ? "default" : "outline"} onClick={() => setTodo(true)}>Nog in te boeken ({inv.filter((i: any) => i.review_status === "te_beoordelen").length})</Button>
          <Button size="sm" variant={todo ? "outline" : "default"} onClick={() => setTodo(false)}>Alle facturen ({inv.length})</Button>
        </div>
        <datalist id="fin-accounts-quick">{accounts.filter((a: any) => a.active).map((a: any) => <option key={a.id} value={a.number}>{a.name}</option>)}</datalist>
        <p className="text-xs text-muted-foreground">{query.trim() ? `${matches.length} facturen gevonden` : `${matches.length} facturen`}</p>
        <div className="max-h-[60dvh] space-y-1 overflow-y-auto">
          {matches.map((i: any) => {
            const tot = i.fin_invoice_lines.reduce((a: number, l: any) => a + Number(l.ex_vat) + Number(l.vat), 0);
            const row = <Button variant="ghost" key={i.id} onClick={() => setSel(i.id)} className={"h-auto w-full whitespace-normal rounded border p-2 text-left text-sm " + (sel === i.id ? "border-primary" : "border-border")}>
              <span><span className="font-medium">{i.counterparty ?? "?"}</span> {i.number} · {i.invoice_date} · {i.doc_type === "creditnota" ? "−" : ""}{eur(tot)} · {i.status}{i.review_status === "te_beoordelen" && <span className="ml-1 rounded bg-warning/20 px-1 text-xs text-warning">beoordelen</span>}</span>
            </Button>;
            if (!todo) return row;
            const nr = pick[i.id] ?? (i.fin_invoice_lines ?? []).find((l: any) => l.account)?.account ?? suggest(rules, i.counterparty, i.fin_invoice_lines?.[0]?.description)?.account ?? "";
            const name = accounts.find((a: any) => a.number === nr)?.name;
            return <div key={i.id} className="space-y-1">
              {row}
              <div className="flex items-center gap-1 pl-2">
                <Input aria-label={`Grootboekrekening voor ${i.counterparty ?? "factuur"} ${i.number ?? ""}`} list="fin-accounts-quick" className="h-8 w-32" placeholder="Rekening" value={nr} onChange={(e) => setPick({ ...pick, [i.id]: e.target.value })} />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{name ?? (nr ? "onbekende rekening" : "")}</span>
                <Button size="sm" disabled={!name} onClick={() => { setPick({ ...pick, [i.id]: nr }); void quickBook({ ...i, _nr: nr }); }}>Inboeken</Button>
              </div>
            </div>;
          })}
          {!matches.length && <p className="py-3 text-sm text-muted-foreground">{query.trim() ? "Geen facturen gevonden." : "Nog geen facturen."}</p>}
        </div>
      </div>
      <div>{cur ? <InvoiceEdit key={cur.id} c={c} inv={cur} rules={rules} onDone={() => { qc.invalidateQueries({ queryKey: ["fin"] }); onDone(); }} /> : <p className="text-sm text-muted-foreground">Kies een factuur.</p>}</div>
    </div>
  );
}

function InvoiceEdit({ c, inv, rules, onDone }: { c: string; inv: any; rules: Rule[]; onDone: () => void }) {
  const [lines, setLines] = useState<any[]>(inv.fin_invoice_lines);
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery({ queryKey: ["fin", "accounts", c], queryFn: async () => (await fetchAll((a, b) => db.from("fin_accounts").select("*").eq("company_id", c).order("number").range(a, b))) as any[] });
  const lineIds: string[] = (inv.fin_invoice_lines ?? []).map((l: any) => l.id).filter(Boolean);
  const { data: linkedAssets = [] } = useQuery({ queryKey: ["fin", "invoice-assets", inv.id], queryFn: async () => lineIds.length ? ((await db.from("fin_investments").select("id,invoice_line_id").eq("company_id", c).in("invoice_line_id", lineIds)).data ?? []) as { id: string; invoice_line_id: string }[] : [] });
  const [scope, setScope] = useState<"factuur" | "soortgelijk" | "leverancier">("soortgelijk");
  const [oneAccount, setOneAccount] = useState("");
  const [bank, setBank] = useState(inv.bank_ref ?? "");
  const [assetLine, setAssetLine] = useState<string | null>(null);
  const [asset, setAsset] = useState({ name: "", account: "230000", start: inv.invoice_date ?? "", life: "60", residual: "0" });
  const [capitalizing, setCapitalizing] = useState(false);
  const capitalize = async () => {
    const line = lines.find((l) => l.id === assetLine);
    const life = Number(asset.life);
    const residual = parseAmount(asset.residual);
    if (!line || !asset.name.trim() || !asset.start || !Number.isInteger(life) || life < 1 || life > 600 || residual == null || residual < 0 || residual >= Number(line.ex_vat)) return void toast.error("Vul naam, startdatum, levensduur en een geldige restwaarde in");
    if (!accounts.some((a: any) => a.number === asset.account && a.active && a.number.startsWith("2"))) return void toast.error("Kies een actieve investeringsrekening (klasse 2)");
    setCapitalizing(true);
    const { error } = await db.rpc("fin_capitalize_invoice_line", { _line: line.id, _asset_account: asset.account, _life: life, _start: asset.start, _name: asset.name.trim(), _residual: residual });
    setCapitalizing(false);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["fin", "invoice-assets", inv.id] });
    qc.invalidateQueries({ queryKey: ["fin", "inv", c] });
    setLines((current) => current.map((l) => l.id === assetLine ? { ...l, account: asset.account, category: "investering", is_investment: true } : l));
    setAssetLine(null);
    toast.success("Factuurlijn geactiveerd; afschrijving staat bij Investeringen");
    onDone();
  };
  const save = async (approve: boolean) => {
    if (assetLine) return void toast.error("Rond eerst de investering af of sluit het formulier");
    if (approve && lines.some((l) => !l.account || !l.category)) return void toast.error("Elke lijn heeft een rekening en categorie nodig");
    if (lines.some((l) => { const before = inv.fin_invoice_lines.find((o: any) => o.id === l.id); return linkedAssets.some((a) => a.invoice_line_id === l.id) && before && !l.is_investment; })) return void toast.error("Een gekoppelde investering kan niet via deze factuur worden gewijzigd");
    for (const l of lines) {
      const before = inv.fin_invoice_lines.find((o: any) => o.id === l.id);
      if (linkedAssets.some((a) => a.invoice_line_id === l.id)) continue;
      if (l.id) await db.from("fin_invoice_lines").update({ description: l.description, ex_vat: l.ex_vat, vat: l.vat, vat_rate: detectVatRate(Number(l.ex_vat), Number(l.vat)), account: l.account, category: l.category, is_investment: l.is_investment }).eq("id", l.id);
      else await db.from("fin_invoice_lines").insert({ invoice_id: inv.id, description: l.description, ex_vat: l.ex_vat, vat: l.vat, vat_rate: detectVatRate(Number(l.ex_vat), Number(l.vat)), account: l.account, category: l.category, is_investment: l.is_investment });
      const changed = !before || before.account !== l.account || before.category !== l.category;
      if (changed && l.account && scope !== "factuur") {
        const sk = normSupplier(inv.counterparty); const kw = scope === "leverancier" ? "" : keywordFrom(l.description);
        const ex = rules.find((r) => r.supplier_key === sk && r.keyword === kw);
        await db.from("fin_rules").upsert({ company_id: c, supplier_key: sk, keyword: kw, account: l.account, category: l.category, scope: scope === "leverancier" ? "leverancier" : "soortgelijk", hits: ex && ex.account === l.account ? ex.hits + 1 : 1, updated_at: new Date().toISOString() }, { onConflict: "company_id,supplier_key,keyword" });
      }
      if (changed) await db.from("fin_audit").insert({ company_id: c, entity: "factuurlijn", entity_id: l.id ?? null, action: "correctie", detail: { scope, van: before ? { account: before.account, category: before.category } : null, naar: { account: l.account, category: l.category } } });
    }
    // Investeringen/gemengde facturen blijven ter beoordeling tot expliciete goedkeuring; geen officiële boeking.
    await db.from("fin_invoices").update({ review_status: approve ? "goedgekeurd" : inv.review_status, bank_ref: bank || null, status: bank ? "betaald" : inv.status, paid_at: bank ? (inv.paid_at ?? new Date().toISOString().slice(0, 10)) : inv.paid_at }).eq("id", inv.id);
    if (approve) await db.from("fin_audit").insert({ company_id: c, entity: "factuur", entity_id: inv.id, action: "goedgekeurd", detail: { lijnen: lines.length } });
    toast.success("Opgeslagen"); onDone();
  };
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (linkedAssets.length) return void toast.error("Deze factuur heeft gekoppelde investeringen — verwijder die eerst onder Investeringen");
    if (!confirm(`Factuur ${inv.counterparty ?? ""} ${inv.number ?? ""} definitief verwijderen? Al geboekte boekingen blijven bestaan.`)) return;
    setDeleting(true);
    const { data: booked } = await db.from("fin_journal_entries").select("id").eq("source_ref", inv.id).limit(1);
    if (booked?.length) {
      setDeleting(false);
      return void toast.error("Deze factuur is al geboekt in het dagboek — verwijderen zou de boekhouding breken. Vraag je boekhouder om een correctieboeking.");
    }
    await db.from("fin_audit").insert({ company_id: c, entity: "factuur", entity_id: inv.id, action: "verwijderd", detail: { counterparty: inv.counterparty, number: inv.number, date: inv.invoice_date } });
    const { error } = await db.from("fin_invoices").delete().eq("id", inv.id);
    setDeleting(false);
    if (error) return void toast.error(error.message);
    toast.success("Factuur verwijderd");
    onDone();
  };
  const upd = (i: number, k: string, v: unknown) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <Card title={`${inv.doc_type === "creditnota" ? "Creditnota" : "Factuur"} ${inv.counterparty ?? ""} ${inv.number ?? ""}`}>
      <p className="text-xs text-muted-foreground">Bron: {inv.source}{inv.source_ref ? ` (${inv.source_ref})` : ""} · vervalt {inv.due_date ?? "onbekend"}</p>
      <datalist id="fin-accounts-inv">{accounts.map((a: any) => <option key={a.id} value={a.number}>{a.name}</option>)}</datalist>
      {lines.map((l, i) => (
        <div key={l.id ?? i} className="mt-2 grid gap-1 rounded border border-border p-2 sm:grid-cols-3">
          <Input disabled={linkedAssets.some((a) => a.invoice_line_id === l.id)} value={l.description ?? ""} onChange={(e) => upd(i, "description", e.target.value)} placeholder="Omschrijving" />
          <Input disabled={linkedAssets.some((a) => a.invoice_line_id === l.id)} value={l.ex_vat} onChange={(e) => upd(i, "ex_vat", parseAmount(e.target.value) ?? 0)} placeholder="Excl. btw" />
          <div className="flex gap-1">
            <select aria-label="Btw-tarief" disabled={linkedAssets.some((a) => a.invoice_line_id === l.id)} className="rounded border border-border bg-background p-1 text-sm" value={l.vat_rate ?? detectVatRate(Number(l.ex_vat), Number(l.vat)) ?? ""} onChange={(e) => { const r = e.target.value === "" ? null : (Number(e.target.value) as VatRate); setLines(lines.map((x, j) => (j === i ? { ...x, vat_rate: r, vat: r == null ? x.vat : vatFor(Number(x.ex_vat), r) } : x))); }}>
              <option value="">?</option>{VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
            <Input disabled={linkedAssets.some((a) => a.invoice_line_id === l.id)} value={l.vat} onChange={(e) => upd(i, "vat", parseAmount(e.target.value) ?? 0)} placeholder="Btw" />
          </div>
          {Number(l.ex_vat) !== 0 && detectVatRate(Number(l.ex_vat), Number(l.vat)) == null && <p className="text-xs text-warning sm:col-span-3">Btw past niet bij 0, 6 of 21% — waarschijnlijk fout uitgelezen, controleer de lijn.</p>}
          <p className="text-xs text-muted-foreground sm:col-span-3">Btw {vatSide(inv.direction)}</p>
          <Input disabled={linkedAssets.some((a) => a.invoice_line_id === l.id)} list="fin-accounts-inv" value={l.account ?? ""} onChange={(e) => { const nr = e.target.value; const a = accounts.find((x: any) => x.number === nr); setLines(lines.map((x, j) => (j === i ? { ...x, account: nr, category: x.category || a?.name || "" } : x))); }} placeholder="Grootboekrekening" />
          <Input disabled={linkedAssets.some((a) => a.invoice_line_id === l.id)} value={l.category ?? ""} onChange={(e) => upd(i, "category", e.target.value)} placeholder="Categorie" />
          {l.account && !accounts.some((x: any) => x.number === l.account) && <p className="text-xs text-warning sm:col-span-3">Rekening {l.account} staat niet in het rekeningschema (Boekhouding → Rekeningschema).</p>}
          {linkedAssets.some((a) => a.invoice_line_id === l.id) ? <p className="text-xs text-primary sm:col-span-3">Als investering geboekt · afschrijvingsschema onder Investeringen</p> : inv.direction === "aankoop" && inv.doc_type === "factuur" && l.id ? <Button size="sm" variant="outline" className="sm:col-span-3 sm:justify-self-start" onClick={() => { setAssetLine(l.id); setAsset({ name: l.description || `${inv.counterparty ?? "Machine"} ${inv.number ?? ""}`.trim(), account: l.account?.startsWith("2") ? l.account : "230000", start: inv.invoice_date ?? "", life: "60", residual: "0" }); }}>Als investering afschrijven</Button> : null}
          {l.confidence != null && <p className="text-xs text-muted-foreground sm:col-span-3">Voorstel via regel, betrouwbaarheid {Math.round(l.confidence * 100)}%</p>}
          {!l.account && (() => { const s = suggest(rules, inv.counterparty, l.description); return s ? <Button size="sm" variant="ghost" className="sm:col-span-3 sm:justify-self-start" onClick={() => setLines(lines.map((x, j) => (j === i ? { ...x, account: s.account, category: s.category } : x)))}>Voorstel: {s.account} {s.category} ({s.reason}, {Math.round(s.confidence * 100)}%)</Button> : <p className="text-xs text-warning sm:col-span-3">Nieuw of dubbelzinnig — handmatig indelen.</p>; })()}
        </div>
      ))}
      {assetLine && <div className="mt-3 space-y-2 border-t border-border pt-3">
        <p className="text-sm font-semibold">Factuurlijn activeren als investering</p>
        <p className="text-xs text-muted-foreground">Een al geboekte kost krijgt een afzonderlijke correctieboeking. Het bedrag excl. btw gaat naar de balans; alleen de maandelijkse afschrijving telt als kost. Controleer de rekening en termijn met je boekhouder.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Naam<Input value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} /></label>
          <label className="text-xs">Balansrekening<select aria-label="Balansrekening" className="w-full rounded border border-border bg-background p-2 text-sm" value={asset.account} onChange={(e) => setAsset({ ...asset, account: e.target.value })}>{!accounts.some((a: any) => a.number === asset.account) && <option value={asset.account}>{asset.account} (niet beschikbaar)</option>}{accounts.filter((a: any) => a.active && a.number.startsWith("2") && !a.number.endsWith("900") && !a.number.endsWith("590")).map((a: any) => <option key={a.id} value={a.number}>{a.number} · {a.name}</option>)}</select></label>
          <label className="text-xs">Startdatum afschrijving<Input type="date" value={asset.start} onChange={(e) => setAsset({ ...asset, start: e.target.value })} /></label>
          <label className="text-xs">Levensduur (maanden)<Input type="number" min="1" max="600" value={asset.life} onChange={(e) => setAsset({ ...asset, life: e.target.value })} /></label>
          <label className="text-xs">Restwaarde excl. btw<Input value={asset.residual} onChange={(e) => setAsset({ ...asset, residual: e.target.value })} /></label>
        </div>
        <div className="flex gap-2"><Button size="sm" disabled={capitalizing} onClick={capitalize}>{capitalizing ? "Boeken…" : "Investering boeken"}</Button><Button size="sm" variant="outline" onClick={() => setAssetLine(null)}>Annuleren</Button></div>
      </div>}
      <Button size="sm" variant="outline" className="mt-2" onClick={() => setLines([...lines, { description: "", ex_vat: 0, vat: 0, account: "", category: "", is_investment: false }])}>Lijn splitsen/toevoegen</Button>
      {lines.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input list="fin-accounts-inv" className="w-64" placeholder="Grootboekrekening voor hele factuur" value={oneAccount} onChange={(e) => setOneAccount(e.target.value)} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const nr = oneAccount.trim();
              const a = accounts.find((x: any) => x.number === nr);
              if (!a) return void toast.error("Kies een bestaande rekening uit het rekeningschema");
              if (linkedAssets.length) return void toast.error("Deze factuur heeft gekoppelde investeringen — pas die lijnen apart aan");
              setLines(lines.map((l) => ({ ...l, account: nr, category: a.name })));
              toast.success(`Alle ${lines.length} lijnen op ${nr} ${a.name} gezet`);
            }}
          >
            Boek alles op deze rekening
          </Button>
        </div>
      )}
      <div className="mt-3 space-y-2">
        <label className="block text-xs">Correctie onthouden voor
          <select className="ml-2 rounded border border-border bg-background p-1" value={scope} onChange={(e) => setScope(e.target.value as any)}><option value="factuur">Enkel deze factuur</option><option value="soortgelijk">Soortgelijke facturen (leverancier + omschrijving)</option><option value="leverancier">Hele leverancier</option></select>
        </label>
        <Input placeholder="Bankreferentie (koppelt betaling, telt niet opnieuw als kost)" value={bank} onChange={(e) => setBank(e.target.value)} />
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => save(false)}>Bewaren</Button><Button size="sm" onClick={() => save(true)}>Goedkeuren</Button>
          {inv.review_status === "goedgekeurd" && <Button size="sm" variant="outline" onClick={async () => { if (!confirm("Goedkeuring intrekken? Een eventuele boeking van deze factuur wordt ook ongedaan gemaakt.")) return; try { const n = await unapproveInvoice(c, inv); toast.success(`Goedkeuring ingetrokken${n ? ` en ${n} boeking(en) ongedaan gemaakt` : ""}`); onDone(); } catch (e: any) { toast.error(e.message); } }}>Goedkeuring intrekken</Button>}</div>
        <div className="border-t border-border pt-2">
          <Button size="sm" variant="destructive" disabled={deleting} onClick={remove}>{deleting ? "Verwijderen…" : "Factuur verwijderen"}</Button>
        </div>
      </div>
    </Card>
  );
}

function Regels({ c }: { c: string }) {
  const { data = [], refetch } = useRules(c);
  return (
    <Card title="Boekingsregels (deterministisch — geen AI-training)">
      <p className="mb-2 text-xs text-muted-foreground">Voorstellen komen uit deze regels: leverancier + trefwoord uit de omschrijving. Een regel 'hele leverancier' wordt enkel gebruikt als die leverancier maar één rekening kent.</p>
      <table className="w-full text-sm"><tbody>
        {data.map((r) => (
          <tr key={r.id} className="border-t border-border">
            <td>{r.supplier_key}</td><td>{r.keyword || "(alles)"}</td>
            <td><input className="w-24 bg-transparent" defaultValue={r.account} onBlur={async (e) => { await db.from("fin_rules").update({ account: e.target.value }).eq("id", r.id); refetch(); }} /></td>
            <td><input className="w-32 bg-transparent" defaultValue={r.category} onBlur={async (e) => { await db.from("fin_rules").update({ category: e.target.value }).eq("id", r.id); refetch(); }} /></td>
            <td>{r.hits}×</td>
            <td><input type="checkbox" checked={r.enabled} onChange={async () => { await db.from("fin_rules").update({ enabled: !r.enabled }).eq("id", r.id); refetch(); }} /></td>
            <td><Button variant="ghost" className="text-destructive" onClick={async () => { await db.from("fin_rules").delete().eq("id", r.id); refetch(); }}>×</Button></td>
          </tr>
        ))}
      </tbody></table>
      {!data.length && <p className="text-sm text-muted-foreground">Nog geen regels. Ze ontstaan wanneer je een factuurlijn indeelt.</p>}
    </Card>
  );
}

const numOrNull = (v: string) => (v === "" ? null : parseAmount(v));

function Investeringen({ c, focus, onDone }: { c: string; focus?: string | undefined; onDone: () => void }) {
  const { data, refetch } = useFinData(c);
  const [sel, setSel] = useState<string | undefined>(focus);
  const list = data?.investments ?? [];
  const cur = list.find((i: any) => i.id === sel);
  return (
    <div className="grid items-start gap-3 md:grid-cols-[minmax(180px,1fr)_2fr]">
      <Card title={`Investeringen (${list.length})`}>
        <Button size="sm" onClick={async () => { const n = prompt("Naam investering"); if (!n) return; const { data: r } = await db.from("fin_investments").insert({ company_id: c, name: n }).select().single(); setSel(r?.id); refetch(); onDone(); }}>+ investering</Button>
        <div className="mt-1 max-h-[60vh] overflow-y-auto pr-1">
          {list.map((i: any) => <Button variant="ghost" key={i.id} onClick={() => setSel(i.id)} className={"mt-1 block h-auto w-full rounded border px-2 py-1 text-left text-xs " + (sel === i.id ? "border-primary bg-primary/10" : "border-border")}>{i.name}</Button>)}
        </div>
      </Card>
      {cur ? <div className="md:sticky md:top-2"><InvestmentEdit key={cur.id} inv={cur} onDone={() => { refetch(); onDone(); }} /></div> : <Card title="Kies een investering"><p className="text-sm text-muted-foreground">Klik links op een investering om de details te zien.</p></Card>}
      <div className="lg:col-span-2"><InvestmentsByAccount c={c} list={list} /></div>
    </div>
  );
}

const typedInv = (i: any) => ({ ...i, capitalizable_amount: i.capitalizable_amount == null || i.capitalizable_amount === "" ? null : Number(i.capitalizable_amount), purchase_amount: i.purchase_amount == null || i.purchase_amount === "" ? null : Number(i.purchase_amount), useful_life_months: i.useful_life_months ? Number(i.useful_life_months) : null, residual_value: Number(i.residual_value || 0), opening_accumulated: Number(i.opening_accumulated || 0) });

function InvestmentsByAccount({ c, list }: { c: string; list: any[] }) {
  const lineIds = list.map((i) => i.invoice_line_id).filter(Boolean);
  const { data: accByLine = {} } = useQuery({ queryKey: ["fin", "inv-line-accounts", c, lineIds.join()], queryFn: async () => {
    if (!lineIds.length) return {} as Record<string, string>;
    const rows = ((await db.from("fin_invoice_lines").select("id,account").in("id", lineIds)).data ?? []) as any[];
    return Object.fromEntries(rows.map((r) => [r.id, r.account ?? ""])) as Record<string, string>;
  } });
  const today = monthKey(new Date());
  const groups = new Map<string, { count: number; cost: number; acc: number; book: number; year: number }>();
  const thisYear = today.slice(0, 4);
  for (const i of list) {
    const t = typedInv(i);
    const sched = depreciationSchedule(t);
    const past = sched.filter((r) => r.month <= today);
    const cost = Number(t.capitalizable_amount ?? t.purchase_amount ?? 0);
    const acc = past.at(-1)?.accumulated ?? t.opening_accumulated;
    const key = (i.invoice_line_id && accByLine[i.invoice_line_id]) || "Zonder rekening";
    const g = groups.get(key) ?? { count: 0, cost: 0, acc: 0, book: 0, year: 0 };
    g.count++; g.cost = r2(g.cost + cost); g.acc = r2(g.acc + acc); g.book = r2(g.book + cost - acc);
    g.year = r2(g.year + sched.filter((r) => r.month.startsWith(thisYear)).reduce((s, r) => s + r.depreciation, 0));
    groups.set(key, g);
  }
  const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const tot = rows.reduce((s, [, g]) => ({ cost: s.cost + g.cost, acc: s.acc + g.acc, book: s.book + g.book, year: s.year + g.year }), { cost: 0, acc: 0, book: 0, year: 0 });
  return (
    <Card title="Totaal per investeringsrekening">
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2">Rekening</th><th className="py-2 text-right">Aantal</th><th className="py-2 text-right">Aanschafwaarde</th><th className="py-2 text-right">Afschrijving {thisYear}</th><th className="py-2 text-right">Gecum. t/m vandaag</th><th className="py-2 text-right">Boekwaarde</th></tr></thead><tbody>
        {rows.map(([k, g]) => <tr key={k} className="border-b border-border/60"><td className="py-1.5">{k}</td><td className="text-right">{g.count}</td><td className="text-right">{eur(g.cost)}</td><td className="text-right">{eur(g.year)}</td><td className="text-right">{eur(g.acc)}</td><td className="text-right font-medium">{eur(g.book)}</td></tr>)}
        <tr className="font-semibold"><td className="py-1.5">Totaal</td><td /><td className="text-right">{eur(r2(tot.cost))}</td><td className="text-right">{eur(r2(tot.year))}</td><td className="text-right">{eur(r2(tot.acc))}</td><td className="text-right">{eur(r2(tot.book))}</td></tr>
      </tbody></table></div>
    </Card>
  );
}

function DeprDetail({ inv, sched }: { inv: any; sched: DeprRow[] }) {
  const [view, setView] = useState<"jaar" | "maand" | "boekingen">("jaar");
  const { data: entries = [] } = useQuery({ queryKey: ["fin", "depr-entries", inv.id], queryFn: async () => ((await db.from("fin_journal_entries").select("id,entry_date,description,source_ref,fin_journal_lines(account,debit,credit)").eq("company_id", inv.company_id).eq("source", "afschrijving").like("source_ref", `${inv.id}:%`).order("entry_date")).data ?? []) as any[] });
  const booked = new Set(entries.map((e) => String(e.source_ref).split(":")[1]));
  const today = monthKey(new Date());
  if (!sched.length) return <p className="mt-2 text-xs text-warning">Geen schema: parameters onvolledig of grond.</p>;
  const years = depreciationByYear(sched);
  const th = "py-1.5 text-right";
  const t = typedInv(inv);
  const cost = Number(t.capitalizable_amount ?? t.purchase_amount ?? 0);
  const past = sched.filter((r) => r.month <= today);
  const acc = past.at(-1)?.accumulated ?? t.opening_accumulated;
  const pct = cost ? Math.min(100, Math.round((acc / cost) * 100)) : 0;
  const fmtM = (m?: string) => m ? new Date(m).toLocaleDateString("nl-BE", { month: "short", year: "numeric" }) : "–";
  const startM = monthKey(t.start_date);
  const endM = addMonths(startM, Number(t.useful_life_months) - 1);
  const stat = (label: string, value: string, strong = false) => <div className="rounded border border-border p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className={strong ? "text-base font-bold" : "text-sm font-medium"}>{value}</p></div>;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs text-muted-foreground">Bron aanschafwaarde: {inv.invoice_line_id ? "gekoppelde aankoopfactuur" : "investeringslijst boekhouder (manueel)"}</p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat("Aanschafwaarde", eur(cost), true)}
        {stat("Per maand", eur(sched[sched.length > 1 ? 1 : 0]?.depreciation ?? 0))}
        {stat("Al afgeschreven", eur(acc))}
        {stat("Boekwaarde nu", eur(r2(cost - acc)), true)}
        {stat("Start", fmtM(startM))}
        {stat("Einde", fmtM(endM))}
        {stat("Levensduur", `${t.useful_life_months} mnd (${r2(Number(t.useful_life_months) / 12)} jaar)`)}
        {stat("Restwaarde", eur(t.residual_value))}
      </div>
      <div className="mb-3"><div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[11px] text-muted-foreground">{pct}% afgeschreven{t.opening_accumulated > 0 ? ` · waarvan ${eur(t.opening_accumulated)} openingssaldo t/m ${fmtM(t.opening_cutoff ? monthKey(t.opening_cutoff) : undefined)}` : ""}</p></div>
      <div className="mb-2 flex flex-wrap gap-1">
        {(["jaar", "maand", "boekingen"] as const).map((v) => <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>{v === "jaar" ? "Per jaar" : v === "maand" ? "Per maand" : `Boekingen (${entries.length})`}</Button>)}
      </div>
      <div className="max-h-64 overflow-auto">
        {view === "jaar" && <table className="w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-1.5">Jaar</th><th className={th}>Maanden</th><th className={th}>Boekwaarde begin</th><th className={th}>Afschrijving</th><th className={th}>Gecumuleerd</th><th className={th}>Boekwaarde einde</th></tr></thead><tbody>
          {years.map((y) => <tr key={y.year} className="border-b border-border/60"><td className="py-1.5">{y.year}</td><td className="text-right">{y.months}</td><td className="text-right">{eur(y.begin)}</td><td className="text-right font-medium">{eur(y.depreciation)}</td><td className="text-right">{eur(y.accumulated)}</td><td className="text-right">{eur(y.end)}</td></tr>)}
        </tbody></table>}
        {view === "maand" && <table className="w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-1.5">Maand</th><th className={th}>Afschrijving</th><th className={th}>Gecumuleerd</th><th className={th}>Boekwaarde</th><th className={th}>Status</th></tr></thead><tbody>
          {sched.map((r) => { const b = booked.has(r.month); return <tr key={r.month} className="border-b border-border/60"><td className="py-1.5">{r.month.slice(0, 7)}</td><td className="text-right">{eur(r.depreciation)}</td><td className="text-right">{eur(r.accumulated)}</td><td className="text-right">{eur(r.bookValue)}</td><td className={"text-right " + (b ? "text-primary" : r.month <= today ? "text-warning" : "text-muted-foreground")}>{b ? "Geboekt" : r.month <= today ? "Nog te boeken" : "Gepland"}</td></tr>; })}
        </tbody></table>}
        {view === "boekingen" && (entries.length ? <table className="w-full text-xs"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-1.5">Datum</th><th className="py-1.5">Rekening</th><th className={th}>Debet</th><th className={th}>Credit</th></tr></thead><tbody>
          {entries.flatMap((e) => (e.fin_journal_lines ?? []).map((l: any, k: number) => <tr key={e.id + k} className={k === 0 ? "border-t border-border/60" : ""}><td className="py-1">{k === 0 ? e.entry_date : ""}</td><td>{l.account}</td><td className="text-right">{Number(l.debit) ? eur(Number(l.debit)) : ""}</td><td className="text-right">{Number(l.credit) ? eur(Number(l.credit)) : ""}</td></tr>))}
        </tbody></table> : <p className="text-xs text-muted-foreground">Nog geen afschrijvingen geboekt in het dagboek.</p>)}
      </div>
    </div>
  );
}

function InvestmentEdit({ inv, onDone }: { inv: any; onDone: () => void }) {
  const [f, setF] = useState<any>({ ...inv });
  const [deprAccount, setDeprAccount] = useState("630200");
  const [accumAccount, setAccumAccount] = useState("230900");
  const [postingDepr, setPostingDepr] = useState(false);
  const { data: assetAccounts = [] } = useQuery({ queryKey: ["fin", "accounts", inv.company_id], queryFn: async () => (await fetchAll((a, b) => db.from("fin_accounts").select("*").eq("company_id", inv.company_id).order("number").range(a, b))) as any[] });
  const toTyped = (f: any) => ({ ...f, capitalizable_amount: f.capitalizable_amount == null || f.capitalizable_amount === "" ? null : Number(f.capitalizable_amount), purchase_amount: f.purchase_amount == null || f.purchase_amount === "" ? null : Number(f.purchase_amount), useful_life_months: f.useful_life_months ? Number(f.useful_life_months) : null, residual_value: Number(f.residual_value || 0), opening_accumulated: Number(f.opening_accumulated || 0) });
  const typed = toTyped(f);
  const origSched = depreciationSchedule(toTyped(inv));
  const sched = depreciationSchedule(typed);
  const { data: bookedMonths = [] } = useQuery({ queryKey: ["fin", "depr-posted", inv.id], queryFn: async () => ((await db.from("fin_journal_entries").select("source_ref").eq("company_id", inv.company_id).eq("source", "afschrijving").like("source_ref", `${inv.id}:%`)).data ?? []).map((r: any) => r.source_ref as string) });
  const postDepreciation = async () => {
    if (JSON.stringify(sched) !== JSON.stringify(origSched)) return void toast.error("Sla wijzigingen aan het afschrijvingsschema eerst op");
    if (!assetAccounts.some((a: any) => a.number === deprAccount && a.active && a.number.startsWith("630")) || !assetAccounts.some((a: any) => a.number === accumAccount && a.active && a.number.startsWith("2"))) return void toast.error("Kies geldige afschrijvings- en cumulatieve rekeningen");
    const todayMonth = monthKey(new Date());
    const due = sched.filter((r) => r.month <= todayMonth && r.depreciation > 0 && !bookedMonths.includes(`${inv.id}:${r.month}`));
    if (!due.length) return void toast.info("Geen openstaande afschrijvingen tot en met deze maand");
    setPostingDepr(true);
    let count = 0;
    for (const r of due) {
      const { error } = await db.rpc("fin_post_entry", { _company: inv.company_id, _journal: "divers", _date: r.month, _description: `Afschrijving ${inv.name}`, _reference: inv.name, _source: "afschrijving", _source_ref: `${inv.id}:${r.month}`, _lines: [{ account: deprAccount, debit: r.depreciation, credit: 0 }, { account: accumAccount, debit: 0, credit: r.depreciation }] });
      if (error) { toast.error(`${count} maand(en) geboekt; ${r.month.slice(0, 7)} mislukt: ${error.message}`); break; }
      count++;
    }
    setPostingDepr(false);
    if (count) { toast.success(`${count} maand(en) afschrijving geboekt`); onDone(); }
  };
  const fld = (k: string, label: string, type = "text") => <label className="text-xs">{label}<Input type={type} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  return (
    <Card title={inv.name}>
      <DeprDetail inv={inv} sched={sched} />
      <details className="mt-3 rounded border border-border p-2">
      <summary className="cursor-pointer text-sm font-semibold">Gegevens aanpassen</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {fld("name", "Naam investering")}
        {inv.invoice_line_id ? <p className="text-xs sm:col-span-2">Gekoppelde factuur · aanschafwaarde {eur(Number(inv.purchase_amount))} · te activeren {eur(Number(inv.capitalizable_amount))}</p> : <>{fld("purchase_amount", "Aankoopbedrag")}{fld("capitalizable_amount", "Te activeren bedrag")}</>}
        {fld("start_date", "Startdatum", "date")}{fld("useful_life_months", "Levensduur (maanden)")}
        {fld("residual_value", "Restwaarde")}{fld("opening_accumulated", "Openingssaldo afschrijvingen")}
        {fld("opening_cutoff", "Cutoff-datum openingssaldo", "date")}{fld("disposal_date", "Buitengebruikstelling", "date")}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.is_land} onChange={(e) => setF({ ...f, is_land: e.target.checked })} />Grond (niet afschrijven)</label>
        <p className="text-xs">Methode: lineair (enige geïmplementeerde methode)</p>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={async () => { const errs = typed.useful_life_months || typed.start_date || typed.capitalizable_amount != null ? validateInvestment(typed) : []; if (!String(f.name ?? "").trim()) return void toast.error("Naam is verplicht"); if (errs.length) return void toast.error(errs.join("; ")); if (inv.invoice_line_id && bookedMonths.length && JSON.stringify(sched) !== JSON.stringify(origSched)) return void toast.error("Reeds geboekte afschrijvingen: wijzig het schema alleen via een boekhoudkundige correctie"); const { id, created_at, user_id, company_id, invoice_line_id, ...rest } = f; void created_at; void user_id; void company_id; void invoice_line_id; const { error } = await db.from("fin_investments").update({ ...rest, ...inv.invoice_line_id ? { purchase_amount: inv.purchase_amount, capitalizable_amount: inv.capitalizable_amount } : { purchase_amount: numOrNull(String(f.purchase_amount ?? "")), capitalizable_amount: numOrNull(String(f.capitalizable_amount ?? "")) }, useful_life_months: typed.useful_life_months, residual_value: typed.residual_value, opening_accumulated: typed.opening_accumulated, start_date: f.start_date || null, opening_cutoff: f.opening_cutoff || null, disposal_date: f.disposal_date || null }).eq("id", id); if (error) return void toast.error(`Opslaan mislukt: ${error.message}`); toast.success("Opgeslagen"); onDone(); }}>Opslaan</Button>
        <Button size="sm" variant="outline" onClick={async () => { if (!confirm(inv.invoice_line_id ? "Deze investering is gekoppeld aan een factuurlijn en er kunnen al afschrijvingen geboekt zijn. Verwijderen maakt die boekingen niet ongedaan. Toch verwijderen?" : "Verwijderen?")) return; await db.from("fin_investments").delete().eq("id", inv.id); onDone(); }}>Verwijderen</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Prorata: de startmaand telt als volledige maand. Laatste maand krijgt het afrondingsverschil; boekwaarde zakt nooit onder restwaarde.</p>
      </details>
      {inv.invoice_line_id && <div className="mt-3 space-y-2 border-t border-border pt-3">
        <p className="text-sm font-semibold">Afschrijvingen in dagboek</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">Afschrijvingskost<select className="w-full rounded border border-border bg-background p-2 text-sm" value={deprAccount} onChange={(e) => setDeprAccount(e.target.value)}>{assetAccounts.filter((a: any) => a.active && a.number.startsWith("630")).map((a: any) => <option key={a.id} value={a.number}>{a.number} · {a.name}</option>)}</select></label>
          <label className="text-xs">Gecumuleerde afschrijving<select className="w-full rounded border border-border bg-background p-2 text-sm" value={accumAccount} onChange={(e) => setAccumAccount(e.target.value)}>{assetAccounts.filter((a: any) => a.active && a.number.startsWith("2") && /afschrijv/i.test(a.name)).map((a: any) => <option key={a.id} value={a.number}>{a.number} · {a.name}</option>)}</select></label>
        </div>
        <Button size="sm" disabled={postingDepr || !sched.length} onClick={postDepreciation}>{postingDepr ? "Boeken…" : "Afschrijvingen boeken t/m vandaag"}</Button>
        <p className="text-xs text-muted-foreground">{bookedMonths.length} maand(en) al geboekt. Elke maand wordt maar één keer geboekt.</p>
      </div>}
    </Card>
  );
}

function Leningen({ c }: { c: string }) {
  const { data, refetch } = useFinData(c);
  const [f, setF] = useState({ name: "", principal: "", annual_rate: "", months: "", start_date: "" });
  const [sel, setSel] = useState<string>();
  const cur = data?.loans.find((l: any) => l.id === sel);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Leningen (annuïteit)">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Naam" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input placeholder="Hoofdsom" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} />
          <Input placeholder="Jaarrente %" value={f.annual_rate} onChange={(e) => setF({ ...f, annual_rate: e.target.value })} />
          <Input placeholder="Looptijd (maanden)" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value })} />
          <Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
        </div>
        <Button size="sm" className="mt-2" onClick={async () => { const p = parseAmount(f.principal), r = parseAmount(f.annual_rate); const le = validateLoan(p, r, Number(f.months)); if (!f.name || !f.start_date || le.length) return void toast.error(le.join("; ") || "Naam en startdatum verplicht"); await db.from("fin_loans").insert({ company_id: c, name: f.name, principal: p, annual_rate: r, months: Number(f.months), start_date: f.start_date }); refetch(); }}>Toevoegen</Button>
        {data?.loans.map((l: any) => <div key={l.id} className="mt-1 flex justify-between text-sm"><Button variant="ghost" onClick={() => setSel(l.id)}>{l.name} · {eur(Number(l.principal))}</Button><Button variant="ghost" className="text-destructive" onClick={async () => { await db.from("fin_loans").delete().eq("id", l.id); refetch(); }}>×</Button></div>)}
      </Card>
      {cur && <Card title={cur.name}><p className="mb-1 text-xs text-muted-foreground">Enkel interest is een kost; kapitaalaflossing is kasstroom.</p><div className="max-h-80 overflow-auto text-xs">{loanSchedule(Number(cur.principal), Number(cur.annual_rate), cur.months, cur.start_date).map((r) => <div key={r.month} className="flex justify-between"><span>{r.month.slice(0, 7)}</span><span>kapitaal {eur(r.principal)} · interest {eur(r.interest)} · saldo {eur(r.balance)}</span></div>)}</div></Card>}
    </div>
  );
}

const METRICS = [["revenue", "Omzet"], ["gross_margin", "Brutomarge"], ["profit", "Winst"], ["equity", "Eigen vermogen"], ["employees", "Werknemers (FTE)"]] as const;
const UITLEG: Record<string, string> = {
  revenue: "Wat de onderneming het hele jaar aan klanten gefactureerd heeft. Een lange balk = veel omzet. Veel omzet alleen betekent nog niet dat een bedrijf winst maakt.",
  gross_margin: "Wat er van de omzet overblijft nadat de ingekochte goederen en diensten zijn afgetrokken. Hoe langer de balk, hoe meer ruimte er is om lonen, huur en administratie te betalen.",
  profit: "Wat er na álle kosten en belastingen echt overblijft. Een balk naar links betekent verlies: dat bedrijf verdiende minder dan het uitgaf.",
  equity: "Het eigen geld in de onderneming: wat ze bezit minus wat ze verschuldigd is. Een dikke balk betekent dat het bedrijf een slecht jaar kan opvangen zonder meteen in de problemen te komen.",
  employees: "Hoeveel mensen er op de loonlijst staan, omgerekend naar volledige jobs. Dit is geen bedrag, dus de getallen zijn hier kleiner.",
};
const UITLEG_LEEG: Record<string, string> = {
  revenue: "Geen omzet gevonden. Kleine ondernemingen leggen een verkort model neer waarin de omzet niet apart staat; die vind je alleen in een volledige jaarrekening of in je eigen boekhouding.",
  gross_margin: "Geen brutomarge gevonden: deze ondernemingen publiceren die niet apart.",
  profit: "Geen winstcijfer gevonden: deze ondernemingen publiceren dat niet.",
  equity: "Geen eigen vermogen gevonden: deze ondernemingen publiceren dat niet.",
  employees: "Geen personeelscijfer gevonden: deze ondernemingen publiceren dat niet.",
};
const kort = (n: number) => Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n * 10) / 10);
function Leeswijzer() {
  const [toonUitleg, setToonUitleg] = useState(true);
  return (
    <div className="mb-3 rounded border border-border bg-muted/40 p-2">
      <Button variant="ghost" className="flex w-full items-center justify-between text-left text-sm font-medium" onClick={() => setToonUitleg((v) => !v)}>
        <span>Waar kijk je naar? Uitleg in gewone taal</span>
        <span className="text-xs text-muted-foreground">{toonUitleg ? "verbergen" : "tonen"}</span>
      </Button>
      {toonUitleg && <div className="mt-1 space-y-1 text-xs text-muted-foreground">
        <p>Elke grafiek vergelijkt <span className="text-foreground">één cijfer</span> van het gekozen boekjaar. Er staan vijf cijfers naast elkaar, van "wat ze verkopen" tot "wat ze overhouden".</p>
        <p><span className="inline-block h-2 w-3 bg-primary align-middle" /> oranje balk = <span className="text-foreground">jouw bedrijf</span>. <span className="inline-block h-2 w-3 bg-muted-foreground align-middle" /> grijze balken = de concurrenten.</p>
        <p>De balken staan van groot naar klein gesorteerd. Bovenaan staat dus het bedrijf met het hoogste cijfer voor die grafiek. De tekst "Riory #2 van 5" betekent: van de bedrijven met cijfers sta jij op de tweede plaats.</p>
        <p>Een balk die naar <span className="text-foreground">links</span> wijst is een negatief getal. Bij winst wil dat zeggen: dat bedrijf heeft verlies gemaakt.</p>
        <p>Wat je er mee doet: ben je veel kleiner dan de rest, dan is groeien de opdracht. Lig je met je winst of brutomarge onder de anderen, dan werk je te duur of factuur je te goedkoop. Een klein eigen vermogen bij een concurrent betekent dat die weinig reserve heeft — een kans voor jou.</p>
        <p className="text-warning">Let op: jaarrekeningen zijn altijd van een afgesloten jaar (meestal vorig jaar) en zijn het wettelijk minimum aan cijfers. Kleine ondernemingen leggen een verkort model neer zonder aparte omzet; dan ontbreekt die balk. Omzet is ook niet hetzelfde als geld op de rekening.</p>
      </div>}
    </div>
  );
}
function useEigenOmzet(year: string) {
  return useQuery({
    queryKey: ["fin", "eigen-omzet", year],
    queryFn: async () => {
      const { data: comps } = await db.from("companies").select("id,name");
      const riory = (comps ?? []).find((c: any) => /riory/i.test(c.name));
      if (!riory) return null;
      let sum = 0, n = 0;
      for (let from = 0; ; from += 1000) {
        const { data: ls } = await db.from("fin_journal_lines").select("debit,credit,fin_journal_entries!inner(entry_date)").eq("company_id", riory.id).like("account", "70%").gte("fin_journal_entries.entry_date", `${year}-01-01`).lte("fin_journal_entries.entry_date", `${year}-12-31`).range(from, from + 999);
        for (const l of ls ?? []) { sum += Number(l.credit) - Number(l.debit); n++; }
        if (!ls || ls.length < 1000) break;
      }
      return n ? Math.round(sum * 100) / 100 : null;
    },
  });
}
function Vergelijking({ data, year }: { data: any[]; year: string }) {
  const { data: eigenOmzet } = useEigenOmzet(year);
  const rows = data.map((d) => {
    let m = d.fin_competitor_metrics.find((x: any) => String(x.fiscal_year) === year);
    if (d.is_own && eigenOmzet != null && (m?.revenue == null)) m = { ...(m ?? {}), revenue: eigenOmzet, _uitBoekhouding: true };
    return { name: d.name, own: !!d.is_own, m };
  }).filter((x) => x.m);
  if (!rows.length) return <div className="mb-3"><Leeswijzer /><p className="text-xs text-muted-foreground">Nog geen cijfers voor {year}. Vul bij een concurrent het ondernemingsnummer in en klik op "Ophalen bij NBB", of laad een jaarrekening-PDF op.</p></div>;
  const own = rows.find((x) => x.own);
  return (
    <div className="mb-4">
      {!own && <p className="mb-2 text-xs text-warning">Voeg Riory toe (knop hierboven) om jezelf in oranje tussen de concurrenten te zien.</p>}
      <Leeswijzer />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {METRICS.map(([k, label]) => {
          const pts = rows.filter((x) => x.m[k] != null).map((x) => ({ name: x.name, v: Number(x.m[k]), own: x.own })).sort((a, b) => b.v - a.v);
          const rank = pts.findIndex((p) => p.own);
          return (
            <div key={k} className="rounded border border-border p-2">
              <p className="text-sm font-medium">{label} {year}{rank >= 0 && <span className="ml-2 text-xs text-primary">Riory #{rank + 1} van {pts.length}</span>}</p>
              <p className="mb-1 text-xs text-muted-foreground">{UITLEG[k]}{k === "employees" ? " Een voltijdse telt als 1, een halve job als 0,5." : ""}</p>
              {k === "revenue" && own?.m?._uitBoekhouding && <p className="mb-1 text-xs text-primary">Omzet van Riory automatisch uit je eigen boekhouding (rekeningen 70).</p>}
              {rank < 0 && own && <p className="mb-1 text-xs text-warning">Van Riory is dit cijfer voor {year} nog niet gekend.{k === "revenue" ? " Je boekhouding in de app bevat nog geen omzet voor dit jaar; vul het in met \"+ jaarcijfers\"." : " Vul het in met \"+ jaarcijfers\"."}</p>}
              {!pts.length ? <p className="py-6 text-center text-xs text-muted-foreground">{UITLEG_LEEG[k] ?? "Geen van deze ondernemingen publiceert dit cijfer."}</p> : (
                <ResponsiveContainer width="100%" height={Math.max(120, pts.length * 28 + 30)}>
                  <BarChart data={pts} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={kort} stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis type="category" dataKey="name" width={110} stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip formatter={(v: number) => (k === "employees" ? v : eur(v))} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                    <Bar dataKey="v">{pts.map((p) => <Cell key={p.name} fill={p.own ? "var(--primary)" : "var(--muted-foreground)"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

let nbbAutoDone = false;
function Concurrenten() {
  const qc = useQueryClient();
  const { data = [], isFetched } = useQuery({ queryKey: ["fin", "comp"], queryFn: async () => (await db.from("fin_competitors").select("*, fin_competitor_metrics(*)").order("name")).data ?? [] });
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [busy, setBusy] = useState<string | null>(null);
  const r = () => qc.invalidateQueries({ queryKey: ["fin", "comp"] });
  const nbb = useServerFn(fetchNbbAccounts);
  const pdf = useServerFn(parseAccountsPdf);
  const haal = async (d: any, stil = false) => {
    setBusy(d.id);
    try {
      const res = await nbb({ data: { competitorId: d.id } });
      if (!stil) res.error && !res.imported ? toast.error(`${d.name}: ${res.error}`) : toast.success(`${d.name}: ${res.imported} jaarrekening(en) opgehaald (${res.years.join(", ")})`);
    } catch (e) { if (!stil) toast.error(e instanceof Error ? e.message : "Ophalen mislukt"); }
    finally { setBusy(null); r(); }
  };
  // Automatisch: bij openen eenmaal per sessie ophalen voor concurrenten met nummer en zonder recente NBB-update (7 dagen).
  useEffect(() => {
    if (!isFetched || nbbAutoDone) return;
    nbbAutoDone = true;
    const grens = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    (async () => {
      for (const d of data as any[]) {
        if (!normalizeEnterpriseNumber(d.enterprise_number)) continue;
        const recent = d.fin_competitor_metrics.some((x: any) => String(x.source).startsWith("NBB") && x.retrieved_at >= grens);
        if (!recent) await haal(d, true);
      }
    })();
  }, [isFetched]); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = async (d: any, f: File) => {
    if (f.size > 10 * 1024 * 1024) { toast.error("PDF is groter dan 10 MB"); return; }
    setBusy(d.id);
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const m = await pdf({ data: { competitorId: d.id, pdfBase64: btoa(bin), fileName: f.name } });
      toast.success(`${d.name} ${m.fiscal_year}: omzet ${eur(m.revenue)}, winst ${eur(m.profit)} — controleer even`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "PDF lezen mislukt"); }
    finally { setBusy(null); r(); }
  };
  return (
    <Card title="Concurrentiemonitor — jaarrekeningen uit de Nationale Bank">
      <p className="mb-2 text-xs text-muted-foreground">Vul het ondernemingsnummer in: de app haalt de laatste 5 jaarrekeningen automatisch op bij de Nationale Bank (en elke week opnieuw bij openen). Geen digitale versie? Laad de PDF op.</p>
      <div className="mb-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { for (const d of data as any[]) if (normalizeEnterpriseNumber(d.enterprise_number)) await haal(d); }}>Alles ophalen bij NBB</Button>
        {!(data as any[]).some((d) => d.is_own) && <Button size="sm" onClick={async () => { const nr = prompt("Ondernemingsnummer van Riory BV (bv. 0123.456.789)"); if (nr === null) return; await db.from("fin_competitors").insert({ name: "Riory BV", is_own: true, identity_confirmed: true, enterprise_number: normalizeEnterpriseNumber(nr) }); r(); }}>Riory toevoegen ter vergelijking</Button>}
        <Button size="sm" onClick={async () => { const n = prompt("Naam concurrent"); if (n) { await db.from("fin_competitors").insert({ name: n }); r(); } }}>+ concurrent</Button>
        <Button size="sm" variant="outline" onClick={async () => { const have = new Set(data.map((d: any) => d.name)); const rows = ["Camrio", "IDBS", "Groep Jaspers", "Rioclean"].filter((n) => !have.has(n)).map((name) => ({ name, note: "Kandidaat — identiteit en ondernemingsnummer te bevestigen" })); if (rows.length) await db.from("fin_competitors").insert(rows); r(); }}>Watchlist-kandidaten toevoegen</Button>
        <label className="text-xs">Vergelijk boekjaar <Input className="inline w-24" value={year} onChange={(e) => setYear(e.target.value)} /></label>
      </div>
      <Vergelijking data={data as any[]} year={year} />
      {data.map((d: any) => {
        const m = d.fin_competitor_metrics.filter((x: any) => String(x.fiscal_year) === year);
        return (
          <div key={d.id} className="mb-2 rounded border border-border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{d.name}{d.is_own && <span className="ml-1 rounded bg-primary px-1 text-xs text-primary-foreground">eigen bedrijf</span>}</span>
              <input className="w-40 rounded border border-border bg-background px-1 text-xs" placeholder="Ondernemingsnr." defaultValue={d.enterprise_number ?? ""} onBlur={async (e) => { await db.from("fin_competitors").update({ enterprise_number: e.target.value || null }).eq("id", d.id); r(); }} />
              <label className="text-xs"><input type="checkbox" checked={d.identity_confirmed} disabled={!d.enterprise_number} onChange={async () => { await db.from("fin_competitors").update({ identity_confirmed: !d.identity_confirmed }).eq("id", d.id); r(); }} /> identiteit bevestigd</label>
              <Button size="sm" variant="ghost" onClick={async () => {
                const fy = prompt("Boekjaar", year); const src = prompt("Bron (bv. NBB balanscentrale, URL)"); if (!fy || !src) return;
                const scope = prompt("Scope (enkelvoudig/geconsolideerd)", "enkelvoudig") || "enkelvoudig";
                const v = (q: string) => numOrNull(prompt(`${q} (leeg = niet gepubliceerd)`) ?? "");
                await db.from("fin_competitor_metrics").upsert({ competitor_id: d.id, fiscal_year: Number(fy), scope, revenue: v("Omzet"), gross_margin: v("Brutomarge"), profit: v("Winst"), equity: v("Eigen vermogen"), employees: v("FTE"), source: src, retrieved_at: new Date().toISOString().slice(0, 10) }, { onConflict: "competitor_id,fiscal_year,scope" }); r();
              }}>+ jaarcijfers</Button>
              <Button size="sm" variant="ghost" disabled={busy === d.id || !normalizeEnterpriseNumber(d.enterprise_number)} onClick={() => haal(d)}>{busy === d.id ? "Bezig…" : "Ophalen bij NBB"}</Button>
              <label className="cursor-pointer text-xs underline">PDF opladen<input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(d, f); }} /></label>
              <Button variant="ghost" className="text-destructive" onClick={async () => { await db.from("fin_competitors").delete().eq("id", d.id); r(); }}>×</Button>
            </div>
            {d.note && <p className="text-xs text-warning">{d.note}</p>}
            {m.map((x: any) => <p key={x.id} className="text-xs">{x.fiscal_year} ({x.scope}): omzet {eur(x.revenue)} · brutomarge {eur(x.gross_margin)} · winst {eur(x.profit)} · EV {eur(x.equity)} — bron {x.source}, {x.retrieved_at}</p>)}
            {!m.length && <p className="text-xs text-muted-foreground">Geen cijfers voor {year}.</p>}
          </div>
        );
      })}
    </Card>
  );
}

/** Haalt nieuwe Simpla-aankoopfacturen op en zet ze in Finance (idempotent op Simpla-ID). */
async function runSimplaImport(c: string, syncPurchases: () => Promise<any>): Promise<{ ok: false; error: string } | { ok: true; n: number; ap: any }> {
    const purchaseResult = await syncPurchases();
    if (!purchaseResult.ok) return { ok: false, error: purchaseResult.error };
    const si = await fetchAll((a, b) => supabase.from("fin_supplier_imports").select("*").order("id").range(a, b));
    const rules = ((await db.from("fin_rules").select("*").eq("company_id", c)).data ?? []) as Rule[];
    const { data: have } = await db.from("fin_invoices").select("source_ref").eq("company_id", c).eq("source", "simpla");
    const known = new Set((have ?? []).map((h: any) => h.source_ref));
    let n = 0;
    for (const s of si as any[]) {
      if (known.has(s.simpla_id)) continue;
      const credit = Number(s.total_ex_vat) < 0;
      const { data: i, error } = await db.from("fin_invoices").insert({ company_id: c, direction: "aankoop", doc_type: credit ? "creditnota" : "factuur", counterparty: s.supplier_name, number: s.bill_number, invoice_date: s.bill_date, source: "simpla", source_ref: s.simpla_id }).select().single();
      if (error) continue; // unieke (company, source, source_ref): idempotent
      const sg = suggest(rules, s.supplier_name, null);
      await db.from("fin_invoice_lines").insert({ invoice_id: i.id, description: `Simpla ${s.bill_number ?? ""}`, ex_vat: Math.abs(Number(s.total_ex_vat)), vat: Math.abs(r2(Number(s.total_inc_vat) - Number(s.total_ex_vat))), account: sg?.account ?? null, category: sg?.category ?? null, confidence: sg?.confidence ?? null, suggestion_rule_id: sg?.ruleId ?? null });
      n++;
    }
    const ap = await applyLearnedRules(c).catch(() => null);
  return { ok: true, n, ap };
}

function Koppelingen({ c, bound, onDone }: { c: string; bound: boolean; onDone: () => void }) {
  const syncPurchases = useServerFn(syncFinancePurchases);
  const loadPonto = useServerFn(pontoStatus);
  const { data: ponto } = useQuery({ queryKey: ["ponto"], queryFn: () => loadPonto() });
  const [busy, setBusy] = useState(false);
  const sync = useQuery({ queryKey: ["fin", "sync", c], queryFn: async () => (await db.from("fin_sync_status").select("*").eq("company_id", c).eq("source", "simpla").maybeSingle()).data });
  const bind = async () => {
    if (!confirm("De Simpla-administratie (één API-token) hoort bij dit bedrijf? Een eventuele andere koppeling wordt verwijderd.")) return;
    const { data: u } = await supabase.auth.getUser();
    const r1 = await db.from("companies").update({ simpla_bound: false }).eq("user_id", u.user?.id ?? "").neq("id", c);
    const r2_ = r1.error ? r1 : await db.from("companies").update({ simpla_bound: true }).eq("id", c);
    if (r2_.error) return void toast.error("Koppelen mislukt");
    await db.from("fin_audit").insert({ company_id: c, entity: "koppeling", action: "simpla_gekoppeld" });
    onDone();
  };
  const importSimpla = async () => {
    if (!bound) return void toast.error("Koppel Simpla eerst aan dit bedrijf");
    setBusy(true);
    try {
    const res = await runSimplaImport(c, syncPurchases);
    if (!res.ok) { setBusy(false); return void toast.error(res.error); }
    const { n, ap } = res;
    setBusy(false); toast.success(`${n} nieuwe Simpla-facturen overgenomen${ap ? `, ${ap.approved} automatisch ingedeeld en goedgekeurd` : ""}`); onDone();
    } catch { toast.error("Simpla-aankoopinlezing mislukt"); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Simpla — aankoopfacturen">
        <p className="text-sm">{bound ? "Dit bedrijf is gekoppeld aan de Simpla-administratie." : "Niet gekoppeld: de Simpla-token hoort bij één administratie. Koppel die eerst aan het juiste bedrijf."} Laatste geslaagde sync: {sync.data?.last_success_at ? new Date(sync.data.last_success_at).toLocaleString("nl-BE") : "nog geen"}{sync.data?.last_error ? ` · laatste fout: ${sync.data.last_error}` : ""}.</p><p className="mt-1 text-sm">Facturen worden op Simpla-ID overgenomen; opnieuw uitvoeren maakt geen dubbels. Simpla geeft geen vervaldatum of grootboekrekening mee — die vul je aan bij beoordeling.</p>
        {!bound && <Button size="sm" variant="outline" className="mt-2 mr-2" onClick={bind}>Simpla koppelen aan dit bedrijf</Button>}<Button size="sm" className="mt-2" disabled={busy || !bound} onClick={importSimpla}>{busy ? "Bezig…" : "Overnemen in dit bedrijf"}</Button>
      </Card>
      <Card title={`Ponto (bank) — ${ponto?.connected ? "gekoppeld" : "niet gekoppeld"}`}>
        <p className="text-sm">{ponto?.connected ? "De bestaande Ponto-koppeling wordt gebruikt. Bankrekeningen en verrichtingen zijn bereikbaar via Boekhouding → Bank." : "Ponto is nog niet gekoppeld. Stel de koppeling in bij Facturen of importeer bankuittreksels als CSV/XLSX."}</p>
      </Card>
      <Card title="Automatische financetaken">
        <p className="text-sm">Taken worden aangemaakt bij het openen van Finance en na elke wijziging hier. Er worden vanuit Finance nooit automatisch mails of betalingen verstuurd.</p>
      </Card>
    </div>
  );
}
