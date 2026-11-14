import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { euro } from '@/lib/billing';
import { getPersonnelBudget } from '@/lib/tikklok/payroll.functions';
import { personnelChartMonths, personnelChartPoint } from '@/lib/tikklok/personnel-chart';

export function PersonnelHoursChart({ companyId, year, today, showOpen }: { companyId: string; year: number; today: string; showOpen: boolean }) {
  const load = useServerFn(getPersonnelBudget);
  const cache = useQueryClient();
  const periods = personnelChartMonths(year, today, showOpen);
  const query = useQuery({
    queryKey: ['dashboard-personnel-hours', companyId, periods.join(','), today],
    enabled: !!companyId && periods.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const points = [];
      // Reuse Finance's protected payroll estimate; serialize expensive monthly reads.
      for (const period of periods) {
        const estimate = await cache.fetchQuery({ queryKey: ['personnel-budget', companyId, period], queryFn: () => load({ data: { companyId, period } }), staleTime: 60_000 });
        points.push(personnelChartPoint(period, estimate));
      }
      return points;
    },
  });
  const rows = query.data ?? [];
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Maandelijkse uren en personeelskosten">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Tikklok: uren en kosten per maand · {year}</h3>
      <Button size="sm" variant="outline" disabled={query.isFetching || !companyId} onClick={async () => {
        await cache.invalidateQueries({ queryKey: ['personnel-budget', companyId], refetchType: 'none' });
        await query.refetch();
      }}><RefreshCw className="size-4" /> Vernieuwen</Button>
    </div>
    <p className="text-xs text-muted-foreground">Geregistreerde klokuren · personeelskostenraming inclusief werkgeversbijdragen en ingestelde reserves, geen geboekte loonkosten.{showOpen ? ' Lopende maand is onvolledig.' : ' Alleen afgesloten maanden.'}</p>
    {query.isPending && companyId && <p className="text-sm text-muted-foreground">Maandelijkse uren en kosten ophalen…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive">{query.error.message}<Button size="sm" variant="outline" className="ml-2" onClick={() => query.refetch()}>Opnieuw proberen</Button></p>}
    {!!rows.length && <>
      <div className="h-72 w-full min-w-0 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={12} />
            <YAxis yAxisId="hours" width={45} tick={{ fontSize: 11 }} tickFormatter={value => `${value} u`} />
            <YAxis yAxisId="cost" orientation="right" width={58} tick={{ fontSize: 11 }} tickFormatter={value => `€${Number(value).toLocaleString('nl-BE', { notation: 'compact' })}`} />
            <Tooltip formatter={(value, name) => [name === 'Klokuren' ? `${Number(value).toLocaleString('nl-BE', { maximumFractionDigits: 2 })} uur` : euro(Number(value)), name]} labelFormatter={(_, payload) => payload[0]?.payload?.period ?? ''} contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="hours" dataKey="hours" name="Klokuren" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            <Line yAxisId="cost" dataKey="cost" name="Kostenraming" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details>
        <summary className="cursor-pointer text-xs font-semibold">Maandbedragen en controlepunten</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="border-b border-border text-left"><th className="py-2">Maand</th><th className="text-right">Klokuren</th><th className="text-right">Kostenraming</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.period} className="border-b border-border"><td className="py-2">{row.period}{row.warnings.map(w => <span key={w} className="block text-destructive">{w}</span>)}</td><td className="text-right tabular-nums">{row.hours.toLocaleString('nl-BE')}</td><td className="text-right tabular-nums">{row.cost == null ? 'Onvolledig' : euro(row.cost)}</td></tr>)}</tbody>
        </table></div>
      </details>
    </>}
  </section>;
}