import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRole } from "@/lib/use-role";
import { euro } from "@/lib/billing";
import { FinanceYear } from "@/components/FinanceYear";
import { computeTotals } from "@/lib/billing";
import { totalSeconds } from "@/lib/time";
import { productRevenue, type ProductLine } from "@/lib/product-revenue";
import { simplaDashboardProducts } from "@/lib/simpla-product-revenue.functions";
import { groupOmzet, manualInvoiceRows, type InvoiceOmzetRow } from "@/lib/dashboard";
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

const iso = (d: Date) => d.toISOString().slice(0, 10);

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

function Dashboard() {
  const role = useRole();
  const navigate = useNavigate();
  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);

  useEffect(() => {
    // Marketing must never pass through the crew calendar: the layout would hide it.
    if (role === "marketing") navigate({ to: "/nieuwsbrieven", replace: true });
    else if (role && role !== "admin") navigate({ to: "/kalender", replace: true });
  }, [role, navigate]);

  const { data: rows = [] } = useQuery({
    queryKey: ["dashboard-omzet", from, to],
    enabled: role === "admin" && !!from && !!to && from <= to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, issue_date, net, vat, total, paid_amount, kind, work_order_id")
        .gte("issue_date", from)
        .lte("issue_date", to);
      if (error) throw error;
      return (data ?? []) as InvoiceOmzetRow[];
    },
  });

  // Omzet per dag volgens de werkdag van de afgewerkte werkbon, niet de factuurdatum.
  const { data: woRows = [] } = useQuery({
    queryKey: ["dashboard-omzet-werkbonnen", from, to],
    enabled: role === "admin" && !!from && !!to && from <= to,
    queryFn: async () => {
      const early = new Date(`${from}T12:00:00Z`); early.setUTCDate(early.getUTCDate() - 60);
      const [w, s, a] = await Promise.all([
        supabase.from("work_orders").select("id, scheduled_date, signed_at, paid_amount, activity_id, distance_km, vat_rate, warranty, no_invoice, time_entries(started_at, ended_at), materials(quantity, unit_price)").eq("status", "afgetekend").eq("no_invoice", false).gte("signed_at", early.toISOString()).limit(5000),
        supabase.from("settings").select("km_rate").eq("id", 1).single(),
        supabase.from("activities").select("id, hourly_rate"),
      ]);
      if (w.error) throw w.error;
      const kmRate = Number(s.data?.km_rate ?? 0);
      return (w.data ?? []).flatMap((o) => {
        const day = (o.scheduled_date ?? o.signed_at ?? "").slice(0, 10);
        if (!day || day < from || day > to) return [];
        const vatRate = Number(o.vat_rate);
        const net = o.paid_amount != null
          ? Number(o.paid_amount) / (1 + vatRate / 100)
          : computeTotals({ seconds: totalSeconds(o.time_entries as never, Date.now()), hourlyRate: Number(a.data?.find((x) => x.id === o.activity_id)?.hourly_rate ?? 0), distanceKm: o.distance_km == null ? null : Number(o.distance_km), kmRate, materials: o.materials.map((m) => ({ quantity: Number(m.quantity), unit_price: Number(m.unit_price) })), vatRate, warranty: o.warranty }).net;
        return [{ id: o.id, issue_date: day, net, vat: 0, total: 0, paid_amount: 0, kind: "werkbon" } as InvoiceOmzetRow];
      });
    },
  });

  const [simplaError, setSimplaError] = useState<string | null>(null);
  const [costs, setCosts] = useState<{ key: string; amount: number }[]>([]);
  // Omzet per product: Simpla-facturen vóór de app (alleen lezen) + materialen op werkbonnen (werkdag) + lijnen van zelf gemaakte facturen.
  const { data: prodLines = [] } = useQuery({
    queryKey: ["dashboard-producten", from, to],
    enabled: role === "admin" && !!from && !!to && from <= to,
    queryFn: async () => {
      const early = new Date(`${from}T12:00:00Z`); early.setUTCDate(early.getUTCDate() - 60);
      const [w, inv] = await Promise.all([
        supabase.from("work_orders").select("scheduled_date, signed_at, materials(name, quantity, unit_price)").eq("status", "afgetekend").eq("no_invoice", false).gte("signed_at", early.toISOString()).limit(5000),
        supabase.from("invoices").select("kind, lines, work_order_id").is("work_order_id", null).gte("issue_date", from).lte("issue_date", to),
      ]);
      if (w.error) throw w.error;
      const sim = await simplaDashboardProducts({ data: { from, to } }).catch(() => ({ lines: [] as ProductLine[], costs: [] as { key: string; amount: number }[], error: "Simpla niet bereikbaar" }));
      setSimplaError(sim.error);
      setCosts(sim.costs);
      const out: ProductLine[] = [...sim.lines];
      for (const o of w.data ?? []) {
        const day = (o.scheduled_date ?? o.signed_at ?? "").slice(0, 10);
        if (!day || day < from || day > to) continue;
        for (const m of o.materials) out.push({ name: m.name, quantity: Number(m.quantity), amount: Number(m.quantity) * Number(m.unit_price) });
      }
      for (const i of inv.data ?? []) {
        const sg = i.kind === "creditnota" ? -1 : 1;
        for (const l of (Array.isArray(i.lines) ? i.lines : []) as any[]) {
          const q = Number(l?.quantity ?? 0);
          out.push({ name: String(l?.description ?? ""), quantity: sg * Math.abs(q), amount: sg * Math.abs(Number(l?.amount ?? q * Number(l?.unitPrice ?? 0))) });
        }
      }
      return out;
    },
  });

  if (role !== "admin") return null;

  const sign = (r: InvoiceOmzetRow) => (r.kind === "creditnota" ? -1 : 1);
  // Zelf gemaakte facturen (zonder werkbon) tellen mee op hun factuurdatum.
  const omzetRows = [...woRows, ...manualInvoiceRows(rows)];
  const omzet = omzetRows.reduce((s, r) => s + Number(r.net), 0);
  const btw = rows.reduce((s, r) => s + sign(r) * Number(r.vat), 0);
  const openstaand = rows.reduce((s, r) => s + sign(r) * Math.max(0, Number(r.total) - Number(r.paid_amount)), 0);
  const punten = groupOmzet(omzetRows, from, to);
  const perMaand = punten.length > 62;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-3 sm:p-4">
      <h1 className="text-2xl font-black uppercase">Dashboard</h1>

      <FinanceYear />

      <h2 className="text-lg font-black uppercase">Facturen per periode</h2>

      <div className="grid max-w-md grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="van">Van</Label>
          <Input id="van" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tot">Tot</Label>
          <Input id="tot" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border bg-card p-3">
          <p className="text-xs font-bold uppercase opacity-70">Omzet (excl. btw)</p>
          <p className="text-xl font-black">{euro(omzet)}</p>
        </div>
        <div className="rounded-md border bg-card p-3">
          <p className="text-xs font-bold uppercase opacity-70">Btw</p>
          <p className="text-xl font-black">{euro(btw)}</p>
        </div>
        <div className="rounded-md border bg-card p-3">
          <p className="text-xs font-bold uppercase opacity-70">Openstaand</p>
          <p className="text-xl font-black">{euro(openstaand)}</p>
        </div>
        <div className="rounded-md border bg-card p-3">
          <p className="text-xs font-bold uppercase opacity-70">Documenten</p>
          <p className="text-xl font-black">{rows.length}</p>
        </div>
      </div>

      <h2 className="text-lg font-black uppercase">Omzet per product</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {productRevenue(prodLines).map((p) => (
          <div key={p.key} className="rounded-md border bg-card p-3">
            <p className="text-xs font-bold uppercase opacity-70">{p.label}</p>
            <p className="text-xl font-black">{euro(p.amount)}</p>
            <p className="text-xs opacity-70">{Math.round(p.quantity * 100) / 100} stuks (excl. btw)</p>
            {(p.key === "regenput" || p.key === "septisch" || p.key === "riostop") && (() => {
              const k = costs.filter((c) => c.key === p.key).reduce((s, c) => s + c.amount, 0);
              const who = p.key === "regenput" ? "Rioclean" : p.key === "septisch" ? "leveranciers" : "IDBS";
              return <p className="mt-1 text-xs"><span className="font-bold">Kost {who}:</span> {euro(k)} · <span className="font-bold">Marge:</span> {euro(p.amount - k)}</p>;
            })()}
          </div>
        ))}
      </div>
      <p className="text-xs opacity-70">Inclusief Simpla-facturen van vóór de eerste werkbon in deze app.{simplaError ? ` Simpla kon niet gelezen worden: ${simplaError}` : ""}</p>

      <div className="rounded-md border bg-card p-3 sm:p-4">
        <p className="mb-3 text-sm font-bold uppercase opacity-70">
          Omzet per {perMaand ? "maand" : "dag"} volgens werkdag van de werkbonnen; zelf gemaakte facturen op hun factuurdatum (excl. btw)
        </p>
        <div className="h-72 w-full sm:h-96">
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
    </main>
  );
}
