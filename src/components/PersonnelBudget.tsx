import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getPersonnelBudget, savePersonnelBudget } from '@/lib/tikklok/payroll.functions';

const eur = (value: number | null) => value == null ? 'Onvolledig' : value.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' });
export function PersonnelBudget({ companyId, period, onDone }: { companyId: string; period: string; onDone: () => void }) {
  const load = useServerFn(getPersonnelBudget);
  const save = useServerFn(savePersonnelBudget);
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ['personnel-budget', companyId, period], queryFn: () => load({ data: { companyId, period } }) });
  return <section className="mb-6 border-b border-border pb-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Personeelskosten uit tikklok · {period}</h3>
      <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className="size-4" /> Vernieuwen</Button>
    </div>
    {query.isPending && <p className="mt-3 text-sm text-muted-foreground">Personeelskosten ophalen…</p>}
    {query.error && <p role="alert" className="mt-3 text-sm text-destructive">{query.error.message}</p>}
    {query.data && <>
      <p className="my-3 text-xs text-muted-foreground">Raming inclusief werkgeversbijdragen en ingestelde reserves; geen loonafrekening of boeking. Vaste maandlonen blijven maandlonen. Verlof, feestdagen en toekomstige loonwijzigingen vragen controle.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
        <thead><tr className="text-left text-muted-foreground"><th>Medewerker</th><th className="text-right">Contracturen</th><th className="text-right">Klokuren</th><th className="text-right">Maandbudget</th><th className="text-right">Kostenraming</th></tr></thead>
        <tbody>{query.data.rows.map(row => <tr key={row.id} className="border-t border-border"><td className="py-2">{row.name}{row.warnings.map(w => <span key={w} className="block text-xs text-destructive">{w}</span>)}</td><td className="text-right">{row.contractHours.toLocaleString('nl-BE', { maximumFractionDigits: 2 })}</td><td className="text-right">{row.workedHours.toLocaleString('nl-BE', { maximumFractionDigits: 2 })}</td><td className="text-right">{eur(row.budget)}</td><td className="text-right">{eur(row.estimated)}</td></tr>)}</tbody>
        <tfoot><tr className="border-t border-border font-semibold"><td className="py-2" colSpan={3}>Totaal</td><td className="text-right">{eur(query.data.budget)}</td><td className="text-right">{eur(query.data.estimated)}</td></tr></tfoot>
      </table></div>
      {!query.data.rows.length && <p className="text-sm text-muted-foreground">Geen medewerkers voor deze maand.</p>}
      {!!query.data.overlaps.length && <p className="mt-3 text-sm text-destructive">Overnemen geblokkeerd om dubbeltelling te vermijden: {query.data.overlaps.join(', ')} staat al in het maandbudget.</p>}
      <Button className="mt-3" size="sm" disabled={query.data.budget == null || saving || query.isFetching || !!query.data.overlaps.length} onClick={async () => {
        if (!window.confirm(`Maandbudget Personeel & zaakvoerder (62) voor ${period} vervangen door de actuele contractraming? Andere budgetposten en boekingen blijven behouden.`)) return;
        setSaving(true);
        try { await save({ data: { companyId, period } }); onDone(); toast.success('Personeelsbudget opgeslagen'); } catch (error) { toast.error(error instanceof Error ? error.message : 'Opslaan mislukt'); } finally { setSaving(false); }
      }}><Save className="size-4" /> {saving ? 'Opslaan…' : 'Overnemen in maandbudget'}</Button>
    </>}
  </section>;
}