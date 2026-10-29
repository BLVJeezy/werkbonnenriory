import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRole } from "@/lib/use-role";
import { euro } from "@/lib/billing";
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

type InvoiceRow = {
  id: string;
  issue_date: string;
  net: number | string;
  vat: number | string;
  total: number | string;
  paid_amount: number | string;
  kind: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

/** Group invoices per day, or per month when the range spans more than 62 days. Credit notes count negative. */
export function groupOmzet(rows: InvoiceRow[], from: string, to: string) {
  const perMonth = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 62;
  const keyOf = (date: string) => (perMonth ? date.slice(0, 7) : date);
  const map = new Map<string, number>();
  // Pre-fill every bucket in the range so the chart shows quiet days/months too.
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    map.set(keyOf(iso(cur)), 0);
    cur.setDate(cur.getDate() + (perMonth ? 32 : 1));
    if (perMonth) cur.setDate(1);
  }
  for (const r of rows) {
    const signed = r.kind === "creditnota" ? -1 : 1;
    const k = keyOf(r.issue_date);
    map.set(k, (map.get(k) ?? 0) + signed * Number(r.net));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, omzet]) => ({
      key,
      label: perMonth
        ? new Date(`${key}-02`).toLocaleDateString("nl-BE", { month: "short", year: "numeric" })
        : new Date(`${key}T12:00:00`).toLocaleDateString("nl-BE", { day: "numeric", month: "short" }),
      omzet: Math.round(omzet * 100) / 100,
    }));
}

function Dashboard() {
  const role = useRole();
  const navigate = useNavigate();
  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);

  if (role && role !== "admin") {
    navigate({ to: "/werkbonnen", replace: true });
    return null;
  }

  const { data: rows = [] } = useQuery({
    queryKey: ["dashboard-omzet", from, to],
    enabled: role === "admin" && !!from && !!to && from <= to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, issue_date, net, vat, total, paid_amount, kind")
        .gte("issue_date", from)
        .lte("issue_date", to);
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });

  const sign = (r: InvoiceRow) => (r.kind === "creditnota" ? -1 : 1);
  const omzet = rows.reduce((s, r) => s + sign(r) * Number(r.net), 0);
  const btw = rows.reduce((s, r) => s + sign(r) * Number(r.vat), 0);
  const openstaand = rows.reduce((s, r) => s + sign(r) * Math.max(0, Number(r.total) - Number(r.paid_amount)), 0);
  const punten = groupOmzet(rows, from, to);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-3 sm:p-4">
      <h1 className="text-2xl font-black uppercase">Dashboard</h1>

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

      <div className="rounded-md border bg-card p-3 sm:p-4">
        <p className="mb-3 text-sm font-bold uppercase opacity-70">Omzet per {punten.length > 62 ? "maand" : "dag"} (excl. btw, creditnota’s afgetrokken)</p>
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
