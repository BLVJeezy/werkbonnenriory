import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRole } from "@/lib/use-role";
import { euro } from "@/lib/billing";
import { FinanceYear } from "@/components/FinanceYear";
import { FinanceWeek } from "@/components/FinanceWeek";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/PageHeader";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { computeTotals } from "@/lib/billing";
import { totalSeconds } from "@/lib/time";
import { productRevenue, type ProductLine } from "@/lib/product-revenue";
import { PRODUCT_GROUPS } from "@/lib/product-revenue";
import { appProductLines } from "@/lib/product-sales";
import { fetchAll } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { simplaDashboardProducts } from "@/lib/simpla-product-revenue.functions";
import { groupOmzet, groupWeekOmzet, manualInvoiceRows, type InvoiceOmzetRow } from "@/lib/dashboard";
import { closedDashboardRange, closedWeekRange, dailyOmzetRange, dashboardToday, lastClosedMonth, lastClosedWeek } from "@/lib/dashboard-period";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Riory Werkbonnen" },
      { name: "description", content: "Omzet per geselecteerde periode in een grafiek." },
      { property: "og:title", content: "Dashboard — Riory Werkbonnen" },
      { property: "og:description", content: "Omzet per geselecteerde periode in een grafiek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const role = useRole();
  const navigate = useNavigate();
  const [currentDay, setCurrentDay] = useState(dashboardToday);
  const [mode, setMode] = useState<"month" | "week">("month");
  const def = mode === "week" ? lastClosedWeek(currentDay) : lastClosedMonth(currentDay);
  const [selectedFrom, setFrom] = useState(def.from);
  // De omzetgrafiek loopt standaard tot vandaag; boekhoudcijfers blijven op afgesloten periodes.
  const [selectedTo, setTo] = useState(currentDay);
  const { from, to } = mode === "week" ? closedWeekRange(selectedFrom, selectedTo, currentDay) : closedDashboardRange(selectedFrom, selectedTo, currentDay);
  // Omzet per dag loopt tot vandaag door, ook in de lopende maand.
  const { from: omzetFrom, to: omzetTo } = dailyOmzetRange(selectedFrom, selectedTo, currentDay);
  const shiftWeek = (days: number) => {
    setFrom(format(addDays(parseISO(from), days), "yyyy-MM-dd"));
    setTo(format(addDays(parseISO(to), days), "yyyy-MM-dd"));
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentDay(dashboardToday()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Marketing must never pass through the crew calendar: the layout would hide it.
    if (role === "marketing") navigate({ to: "/nieuwsbrieven", replace: true });
    else if (role && role !== "admin") navigate({ to: "/kalender", replace: true });
  }, [role, navigate]);

  const { data: rows = [] } = useQuery({
    queryKey: ["dashboard-omzet", omzetFrom, omzetTo],
    enabled: role === "admin" && !!omzetFrom && !!omzetTo && omzetFrom <= omzetTo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, issue_date, net, vat, total, paid_amount, kind, work_order_id")
        .gte("issue_date", omzetFrom)
        .lte("issue_date", omzetTo);
      if (error) throw error;
      return (data ?? []) as InvoiceOmzetRow[];
    },
  });

  // Omzet per dag volgens de werkdag van de afgewerkte werkbon, niet de factuurdatum.
  const { data: woRows = [] } = useQuery({
    queryKey: ["dashboard-omzet-werkbonnen", omzetFrom, omzetTo],
    enabled: role === "admin" && !!omzetFrom && !!omzetTo && omzetFrom <= omzetTo,
    queryFn: async () => {
      const early = new Date(`${omzetFrom}T12:00:00Z`); early.setUTCDate(early.getUTCDate() - 60);
      const [w, s, a] = await Promise.all([
        supabase.from("work_orders").select("id, scheduled_date, signed_at, paid_amount, activity_id, distance_km, vat_rate, warranty, no_invoice, no_intervention, time_entries(started_at, ended_at), materials(quantity, unit_price)").eq("status", "afgetekend").eq("no_invoice", false).gte("signed_at", early.toISOString()).limit(5000),
        supabase.from("settings").select("km_rate").eq("id", 1).single(),
        supabase.from("activities").select("id, hourly_rate, no_intervention_fee"),
      ]);
      if (w.error) throw w.error;
      const kmRate = Number(s.data?.km_rate ?? 0);
      return (w.data ?? []).flatMap((o) => {
        const day = (o.scheduled_date ?? o.signed_at ?? "").slice(0, 10);
        if (!day || day < omzetFrom || day > omzetTo) return [];
        const vatRate = Number(o.vat_rate);
        const net = o.paid_amount != null
          ? Number(o.paid_amount) / (1 + vatRate / 100)
          : computeTotals({ seconds: totalSeconds(o.time_entries as never, Date.now()), hourlyRate: Number(a.data?.find((x) => x.id === o.activity_id)?.hourly_rate ?? 0), distanceKm: o.distance_km == null ? null : Number(o.distance_km), kmRate, materials: o.materials.map((m) => ({ quantity: Number(m.quantity), unit_price: Number(m.unit_price) })), vatRate, warranty: o.warranty, flatLabour: o.no_intervention ? Number(a.data?.find((x) => x.id === o.activity_id)?.no_intervention_fee ?? 80) : null }).net;
        return [{ id: o.id, issue_date: day, net, vat: 0, total: 0, paid_amount: 0, kind: "werkbon" } as InvoiceOmzetRow];
      });
    },
  });

  const [simplaError, setSimplaError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const readSimpla = useServerFn(simplaDashboardProducts);
  const [costs, setCosts] = useState<{ key: string; amount: number }[]>([]);
  // Product sales use invoice snapshots and invoice dates; daily revenue keeps its work-day rules.
  const { data: prodLines = [], isFetching: productsLoading, error: productError, refetch: refreshProducts } = useQuery({
    queryKey: ["dashboard-producten", from, to],
    enabled: role === "admin" && !!from && !!to && from <= to,
    queryFn: async () => {
      const [inv, sim] = await Promise.all([
        fetchAll((a, b) => supabase.from("invoices").select("id, number, issue_date, kind, lines").gte("issue_date", from).lte("issue_date", to).order("id").range(a, b)),
        readSimpla({ data: { from, to } }).catch(() => ({ lines: [] as ProductLine[], costs: [] as { key: string; amount: number }[], error: "Simpla niet bereikbaar", costError: "Aankoopkosten niet beschikbaar", checkedAt: null })),
      ]);
      setSimplaError(sim.error);
      setCostError(sim.costError);
      setCheckedAt(sim.checkedAt);
      setCosts(sim.costs);
      return [...sim.lines, ...appProductLines(inv, from, to)];
    },
  });

  if (role !== "admin") return null;

  const sign = (r: InvoiceOmzetRow) => (r.kind === "creditnota" ? -1 : 1);
  // Zelf gemaakte facturen (zonder werkbon) tellen mee op hun factuurdatum.
  const omzetRows = [...woRows, ...manualInvoiceRows(rows)];
  const omzet = omzetRows.reduce((s, r) => s + Number(r.net), 0);
  const btw = rows.reduce((s, r) => s + sign(r) * Number(r.vat), 0);
  const openstaand = rows.reduce((s, r) => s + sign(r) * Math.max(0, Number(r.total) - Number(r.paid_amount)), 0);
  const punten = mode === "week" ? groupWeekOmzet(omzetRows, omzetFrom, omzetTo) : groupOmzet(omzetRows, omzetFrom, omzetTo);
  const perMaand = punten.length > 62;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Omzet per dag loopt tot vandaag · boekhoud- en productcijfers over afgesloten ${mode === "week" ? "weken (ma–zo)" : "maanden"} t/m ${def.to.split("-").reverse().join("/")}`}
        actions={
          <ToggleGroup
            type="single"
            value={mode}
            aria-label="Dashboardperiode"
            className="rounded-lg border bg-card p-1"
            onValueChange={(value) => {
              if (value !== "month" && value !== "week") return;
              setMode(value);
              const range = value === "week" ? lastClosedWeek(currentDay) : lastClosedMonth(currentDay);
              setFrom(range.from);
              setTo(currentDay);
            }}
          >
            <ToggleGroupItem value="month" aria-label="Per maand" className="px-3 text-xs font-semibold">Maand</ToggleGroupItem>
            <ToggleGroupItem value="week" aria-label="Per week" className="px-3 text-xs font-semibold">Week</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      {/* Periode & KPI-overzicht */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border/90 bg-card p-4 shadow-xs">
          <div>
            <h2 className="text-base font-bold text-foreground">{mode === "week" ? "Cijfers per week" : "Facturen & omzet per periode"}</h2>
            <p className="text-xs text-muted-foreground">Selecteer een datumbereik om omzet, btw en openstaande bedragen te bekijken.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            {mode === "week" && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="icon" aria-label="Vorige week" onClick={() => shiftWeek(-7)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" aria-label="Volgende week" disabled={to >= def.to} onClick={() => shiftWeek(7)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="van" className="text-xs text-muted-foreground">Van</Label>
              <Input id="van" type="date" value={selectedFrom} max={selectedTo} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tot" className="text-xs text-muted-foreground">Tot</Label>
              <Input id="tot" type="date" value={selectedTo} min={selectedFrom} max={currentDay} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <div className="rounded-xl border border-border/90 border-l-4 border-l-primary bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Omzet (excl. btw)</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-foreground">{euro(omzet)}</p>
          </div>
          <div className="rounded-xl border border-border/90 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Btw</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-foreground">{euro(btw)}</p>
          </div>
          <div className="rounded-xl border border-border/90 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Openstaand</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-foreground">{euro(openstaand)}</p>
          </div>
          <div className="rounded-xl border border-border/90 bg-card p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documenten</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-foreground">{rows.length}</p>
          </div>
        </div>

        {/* Hoofdgrafiek */}
        <div className="rounded-xl border border-border/90 bg-card p-4 shadow-xs sm:p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-foreground">
              Omzet per {mode === "week" ? "week" : perMaand ? "maand" : "dag"} (excl. btw)
            </h3>
            <p className="text-xs text-muted-foreground">
              Werkbonnen op werkdag · losse facturen op factuurdatum · t/m vandaag
            </p>
          </div>
          <div className="h-72 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={punten} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `€${Math.round(v)}`} width={70} />
                <Tooltip
                  formatter={(value) => [euro(Number(value)), "Omzet"]}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Bar dataKey="omzet" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Boekhoudkundig jaar- of weekoverzicht */}
      {mode === "month" && <FinanceYear />}
      {mode === "week" && <FinanceWeek from={from} to={to} />}

      {/* Omzet per product */}
      <section className="space-y-3.5 rounded-xl border border-border/90 bg-card p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Omzet per product</h2>
            <p className="text-xs text-muted-foreground">
              Verkoopfacturen en creditnota’s uit Simpla en deze app, op factuurdatum (excl. btw).{checkedAt ? ` Simpla gecontroleerd: ${new Date(checkedAt).toLocaleString("nl-BE")}.` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={productsLoading} onClick={() => refreshProducts()}>
            {productsLoading ? "Ophalen…" : "Opnieuw ophalen"}
          </Button>
        </div>

        {productError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Productomzet kon niet worden geladen. Probeer opnieuw.</p>}
        {simplaError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Historische omzet ontbreekt: {simplaError}. De bedragen zijn onvolledig.</p>}
        {costError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Kosten en marge zijn onvolledig: {costError}.</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productRevenue(prodLines).map((p) => (
            <div key={p.key} className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/25 p-3.5">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p.label}</p>
                  <span className="text-xs text-muted-foreground">{Math.round(p.quantity * 100) / 100} st</span>
                </div>
                <p className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">{productsLoading ? "…" : euro(p.amount)}</p>
              </div>
              <div className="mt-2.5 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                <p>Simpla: {euro(productRevenue(prodLines.filter(l => l.source === "simpla")).find(g => g.key === p.key)?.amount ?? 0)} · App: {euro(productRevenue(prodLines.filter(l => l.source === "app")).find(g => g.key === p.key)?.amount ?? 0)}</p>
                {(p.key === "regenput" || p.key === "septisch" || p.key === "riostop") && (() => {
                  const k = costs.filter((c) => c.key === p.key).reduce((s, c) => s + c.amount, 0);
                  const who = p.key === "regenput" ? "Rioclean" : p.key === "septisch" ? "leveranciers" : "IDBS";
                  return <p className="text-foreground"><span className="font-semibold">Kost {who}:</span> {euro(k)} · <span className="font-semibold">Marge:</span> {costError || simplaError || productError || productsLoading ? "Niet beschikbaar" : euro(p.amount - k)}</p>;
                })()}
              </div>
            </div>
          ))}
        </div>

        <details className="border-t border-border/70 pt-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
            Overige / niet-herkende productregels ({prodLines.filter(l => !PRODUCT_GROUPS.some(g => g.match(l.name))).length})
          </summary>
          <div className="mt-2 max-h-96 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50"><tr><th className="p-2">Bron</th><th className="p-2">Factuur</th><th className="p-2">Datum</th><th className="p-2">Product</th><th className="p-2 text-right">Excl. btw</th></tr></thead>
              <tbody>{prodLines.filter(l => !PRODUCT_GROUPS.some(g => g.match(l.name))).map((l, index) => <tr key={`${l.source}-${l.invoiceNumber}-${index}`} className="border-t"><td className="p-2">{l.source === "simpla" ? "Simpla" : "App"}</td><td className="p-2 font-mono">{l.invoiceNumber}</td><td className="p-2 whitespace-nowrap">{l.date}</td><td className="p-2">{l.name || "Zonder omschrijving"}{l.sourceProductId ? ` (Simpla-product ${l.sourceProductId})` : ""}</td><td className="p-2 text-right font-mono whitespace-nowrap">{euro(l.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
