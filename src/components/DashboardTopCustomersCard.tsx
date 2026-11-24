import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { euro } from "@/lib/billing";
import type { CustomerRevenueSlice, HeroPeriodRange } from "@/lib/dashboard-annual";

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

type Props = {
  period: HeroPeriodRange;
  sourceLabel: string;
  isFetching: boolean;
  slices: CustomerRevenueSlice[];
  negativeAdjustments: CustomerRevenueSlice[];
  simplaIncomplete: boolean;
  simplaDocCount: number;
  simplaMinDate: string | null;
  simplaMaxDate: string | null;
};

export function DashboardTopCustomersCard({
  period,
  sourceLabel,
  isFetching,
  slices,
  negativeAdjustments,
  simplaIncomplete,
  simplaDocCount,
  simplaMinDate,
  simplaMaxDate,
}: Props) {
  const chartSlices = useMemo(
    () =>
      slices
        .map((s, idx) => ({
          ...s,
          value: Math.max(0, s.amountExVat),
          color: SLICE_COLORS[idx % SLICE_COLORS.length]!,
        }))
        .filter((s) => s.value > 0),
    [slices],
  );

  return (
    <div className="flex flex-col rounded-xl border border-border/90 bg-card p-5 shadow-xs lg:col-span-12">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">Klanten met de meeste omzet</h2>
          <p className="text-xs text-muted-foreground">
            Netto gefactureerde omzet excl. btw · {period.shortPeriodLabel} · {sourceLabel}
          </p>
        </div>
      </div>

      {chartSlices.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-xs text-muted-foreground">
          <p>
            {isFetching
              ? "Gegevens laden…"
              : negativeAdjustments.length > 0
                ? `Geen positieve netto klantenomzet voor ${period.shortPeriodLabel} (alleen creditnota-correcties).`
                : `Geen gefactureerde klantenomzet gevonden voor ${period.shortPeriodLabel}.`}
          </p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 items-center gap-4 sm:grid-cols-12">
          <div className="h-52 w-full sm:col-span-4 lg:col-span-3">
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
                    const p = item?.payload as { sharePct?: number; invoiceCount?: number; creditNoteCount?: number } | undefined;
                    const docs = `${p?.invoiceCount ?? 0} fact.${p?.creditNoteCount ? ` · ${p.creditNoteCount} CN` : ""}`;
                    return [`${euro(Number(val))} (${p?.sharePct ?? 0}%) · ${docs}`, ""];
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

          <ul className="space-y-1.5 text-xs sm:col-span-8 lg:col-span-9">
            {chartSlices.map((s) => {
              const canNavigate = !s.isOther && !s.isUnassigned && !!s.customerId;
              return (
                <li key={s.key} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {canNavigate ? (
                      <Link
                        to="/klanten"
                        search={{ q: s.label }}
                        className="truncate text-foreground underline-offset-2 hover:text-primary hover:underline"
                      >
                        {s.label}
                      </Link>
                    ) : (
                      <span className="truncate text-foreground">{s.label}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    <strong className="text-foreground">{euro(s.amountExVat)}</strong> ({s.sharePct}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {negativeAdjustments.length > 0 && (
        <div className="mt-3 border-t border-border/70 pt-2.5 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Netto-correcties (creditnota’s &gt; facturen):</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {negativeAdjustments.map((c) => (
              <li key={c.key} className="font-mono">
                <span className="font-sans text-foreground">{c.label}:</span> {euro(c.amountExVat)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {simplaIncomplete && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <strong className="text-foreground">Simpla data niet volledig:</strong>{" "}
            {simplaDocCount === 0
              ? `geen geïmporteerde Simpla-verkoopfacturen voor ${period.shortPeriodLabel}.`
              : `geïmporteerd van ${fmtDateBE(simplaMinDate!)} t/m ${fmtDateBE(simplaMaxDate!)}.`}
          </span>
        </p>
      )}
    </div>
  );
}