import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { euro } from "@/lib/billing";
import {
  buildAnnualRevenueSummary,
  type AppInvoiceInput,
  type BreakdownMetric,
  type RevenueSourceFilter,
  type SimplaInvoiceInput,
} from "@/lib/dashboard-annual";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
  "var(--muted-foreground)",
  "var(--destructive)",
];

const fmtDateBE = (iso: string) => iso.split("-").reverse().join("/");

export function DashboardAnnualHero({ currentDay }: { currentDay: string }) {
  const currentYear = Number(currentDay.slice(0, 4)) || 2026;
  const [year, setYear] = useState<number>(currentYear);
  const [sourceFilter, setSourceFilter] = useState<RevenueSourceFilter>("all");
  const [metric, setMetric] = useState<BreakdownMetric>("revenue");

  const years = useMemo(() => [currentYear, currentYear - 1, currentYear - 2], [currentYear]);
  const yearFrom = `${year}-01-01`;
  const yearTo = `${year}-12-31`;

  const { data, isFetching, error } = useQuery({
    queryKey: ["dashboard-annual-hero", year],
    queryFn: async () => {
      const [appInvoices, simplaRaw] = await Promise.all([
        fetchAll((a, b) =>
          supabase
            .from("invoices")
            .select("id, number, issue_date, kind, status, net, lines")
            .gte("issue_date", yearFrom)
            .lte("issue_date", yearTo)
            .order("id")
            .range(a, b),
        ),
        fetchAll((a, b) =>
          supabase
            .from("fin_invoices")
            .select("id, number, invoice_date, doc_type, status, source, fin_invoice_lines(description, ex_vat)")
            .eq("direction", "verkoop")
            .eq("source", "simpla")
            .gte("invoice_date", yearFrom)
            .lte("invoice_date", yearTo)
            .order("id")
            .range(a, b),
        ),
      ]);

      const simplaInvoices: SimplaInvoiceInput[] = (simplaRaw ?? []).map((row: Record<string, unknown>) => ({
        id: String(row["id"] ?? ""),
        number: String(row["number"] ?? ""),
        invoice_date: String(row["invoice_date"] ?? ""),
        doc_type: String(row["doc_type"] ?? "factuur"),
        status: String(row["status"] ?? ""),
        source: String(row["source"] ?? ""),
        lines: Array.isArray(row["fin_invoice_lines"])
          ? (row["fin_invoice_lines"] as Record<string, unknown>[]).map((l) => ({
              description: l["description"] == null ? null : String(l["description"]),
              ex_vat: Number(l["ex_vat"] ?? 0),
            }))
          : [],
      }));

      return {
        appInvoices: (appInvoices ?? []) as AppInvoiceInput[],
        simplaInvoices,
      };
    },
  });

  const summary = useMemo(
    () =>
      buildAnnualRevenueSummary({
        year,
        sourceFilter,
        metric,
        appInvoices: data?.appInvoices ?? [],
        simplaInvoices: data?.simplaInvoices ?? [],
        todayIso: currentDay,
      }),
    [year, sourceFilter, metric, data, currentDay],
  );

  const chartSlices = useMemo(
    () =>
      summary.slices
        .map((s, idx) => ({
          ...s,
          value: Math.max(0, metric === "revenue" ? s.amountExVat : s.quantity),
          color: SLICE_COLORS[idx % SLICE_COLORS.length]!,
        }))
        .filter((s) => s.value > 0),
    [summary.slices, metric],
  );

  const periodLabel =
    year === currentYear
      ? `01/01/${year} – ${fmtDateBE(currentDay)}`
      : `01/01/${year} – 31/12/${year}`;

  const sourceLabel =
    sourceFilter === "all"
      ? "Werkbonnenriory + Simpla"
      : sourceFilter === "werkbonnen"
        ? "Alleen Werkbonnenriory"
        : "Alleen Simpla (geïmporteerd)";

  return (
    <section aria-label="Jaaromzet en topproducten" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Links (desktop) / Bovenaan (mobiel): Jaaromzet KPI */}
      <div className="flex flex-col justify-between rounded-xl border border-border/90 border-l-4 border-l-primary bg-card p-5 shadow-xs lg:col-span-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Jaaromzet (excl. btw)
              </p>
              <p className="text-xs text-muted-foreground">
                {periodLabel} · {sourceLabel}
              </p>
            </div>
            <select
              aria-label="Omzetjaar"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-semibold text-foreground"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="font-mono text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {isFetching ? "…" : euro(summary.totalExVat)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.invoiceCount} facturen · {summary.creditNoteCount} creditnota’s (negatief verrekend)
            </p>
          </div>

          <ToggleGroup
            type="single"
            value={sourceFilter}
            aria-label="Omzetbron"
            className="w-fit rounded-lg border bg-muted/40 p-0.5"
            onValueChange={(v) => {
              if (v === "all" || v === "werkbonnen" || v === "simpla") setSourceFilter(v);
            }}
          >
            <ToggleGroupItem value="all" className="h-7 px-2.5 text-xs font-semibold">Alle</ToggleGroupItem>
            <ToggleGroupItem value="werkbonnen" className="h-7 px-2.5 text-xs font-semibold">Werkbonnen</ToggleGroupItem>
            <ToggleGroupItem value="simpla" className="h-7 px-2.5 text-xs font-semibold">Simpla</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="mt-4 space-y-2 border-t border-border/70 pt-3 text-xs">
          <div className="flex flex-wrap justify-between gap-2 text-muted-foreground">
            <span>Werkbonnenriory: <strong className="font-mono text-foreground">{euro(summary.werkbonnenExVat)}</strong> ({summary.werkbonnenDocCount})</span>
            <span>Simpla: <strong className="font-mono text-foreground">{euro(summary.simplaExVat)}</strong> ({summary.simplaDocCount})</span>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-destructive">
              Jaaromzet kon niet worden geladen.
            </p>
          )}
          {summary.simplaIncomplete && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>
                <strong className="text-foreground">Simpla data niet volledig:</strong>{" "}
                {summary.simplaDocCount === 0
                  ? `geen geïmporteerde Simpla-verkoopfacturen voor ${year}.`
                  : `geïmporteerd van ${fmtDateBE(summary.simplaMinDate!)} t/m ${fmtDateBE(summary.simplaMaxDate!)}.`}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Rechts (desktop) / Eronder (mobiel): Donutdiagram Meest verkochte producten en activiteiten */}
      <div className="flex flex-col rounded-xl border border-border/90 bg-card p-5 shadow-xs lg:col-span-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-foreground">Meest verkochte producten en activiteiten</h2>
            <p className="text-xs text-muted-foreground">
              {metric === "revenue" ? "Gebaseerd op gefactureerde omzet excl. btw" : "Gebaseerd op gefactureerd aantal"} · {year}
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={metric}
            aria-label="Weergave diagram"
            className="rounded-lg border bg-muted/40 p-0.5"
            onValueChange={(v) => {
              if (v === "revenue" || v === "count") setMetric(v);
            }}
          >
            <ToggleGroupItem value="revenue" className="h-7 px-2.5 text-xs font-semibold">Op omzet (€)</ToggleGroupItem>
            <ToggleGroupItem value="count" className="h-7 px-2.5 text-xs font-semibold">Op aantal</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {chartSlices.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-10 text-xs text-muted-foreground">
            {isFetching ? "Gegevens laden…" : `Geen gefactureerde regels gevonden voor ${year}.`}
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 items-center gap-4 sm:grid-cols-12">
            <div className="h-52 w-full sm:col-span-5">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartSlices}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius="54%"
                    outerRadius="86%"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {chartSlices.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, _name, item) => {
                      const p = item?.payload as { sharePct?: number } | undefined;
                      const formatted =
                        metric === "revenue" ? euro(Number(val)) : `${Math.round(Number(val) * 100) / 100} st`;
                      return [`${formatted} (${p?.sharePct ?? 0}%)`, ""];
                    }}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="space-y-1.5 text-xs sm:col-span-7">
              {chartSlices.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="truncate text-foreground">{s.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    <strong className="text-foreground">
                      {metric === "revenue" ? euro(s.amountExVat) : `${Math.round(s.quantity * 100) / 100}`}
                    </strong>{" "}
                    ({s.sharePct}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}