import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveSupplier } from '@/lib/suppliers.functions';
import { PAYMENT_METHODS, VAT_RULES } from '@/lib/supplier-rules';
import { supplierBankWarnings } from '@/lib/purchase-booking';
import type { Database } from '@/integrations/supabase/types';
import { SortTh, Th, tableCls, tableWrap, useSort } from '@/components/SortTable';
type Supplier = Database['public']['Tables']['suppliers']['Row'];
export const Route = createFileRoute('/_authenticated/leveranciers')({
  head: () => ({ meta: [{ title: 'Leveranciers — Riory Werkbonnen' }, { name: 'description', content: 'Betaalwijzen en btw-regels per leverancier beheren.' }, { property: 'og:title', content: 'Leveranciers — Riory Werkbonnen' }, { property: 'og:description', content: 'Leveranciers en hun aankoopinstellingen.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: Suppliers,
});
function Suppliers() {
  const qc = useQueryClient(); const save = useServerFn(saveSupplier);
  const [edit, setEdit] = useState<Supplier | null>(null); const [busy, setBusy] = useState(false); const [search,setSearch] = useState('');
  const { data: rows = [] } = useQuery({ queryKey: ['suppliers'], queryFn: async () => {
    const {data,error} = await supabase.from('suppliers').select('*').order('name'); if(error) throw error; return data;
  } });
  const visible = rows.filter(r=>r.name.toLowerCase().includes(search.toLowerCase()));
  const sort = useSort(visible, { naam: r=>r.name, btw: r=>r.vat_number, betaal: r=>r.payment_method, regel: r=>r.vat_rule, aftrek: r=>Number(r.vat_deductible_percent) }, 'naam');
  async function submit() {
    if (!edit) return; setBusy(true);
    try { await save({ data: edit }); await qc.invalidateQueries({ queryKey: ['suppliers'] }); setEdit(null); toast.success('Leverancier opgeslagen'); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black uppercase">Leveranciers</h1></div>
    {rows.some(r=>supplierBankWarnings(r).length) && <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm font-bold">⚠ {rows.filter(r=>supplierBankWarnings(r).length).length} leverancier(s) zonder volledige IBAN/BIC. Elke leverancier heeft deze gegevens nodig.</p>}
    <p className="text-sm text-muted-foreground">De standaard betaalwijze geldt voor alle nog niet afgeletterde facturen van die leverancier.</p>
    <Input aria-label="Leverancier zoeken" placeholder="Leverancier zoeken" value={search} onChange={e=>setSearch(e.target.value)} />
    <div className={tableWrap}><table className={tableCls}>
      <thead><tr><SortTh k="naam" sort={sort}>Naam</SortTh><SortTh k="btw" sort={sort} className="hidden sm:table-cell">Btw-nummer</SortTh><SortTh k="betaal" sort={sort} className="hidden md:table-cell">Betaalwijze</SortTh><SortTh k="regel" sort={sort} className="hidden md:table-cell">Btw-regel</SortTh><SortTh k="aftrek" sort={sort} right>Aftrekbaar</SortTh><Th /></tr></thead>
      <tbody>{sort.sorted.map(r=><tr key={r.id}>
        <td className="font-bold">{r.name}{supplierBankWarnings(r).length>0 && <span className="ml-2 rounded bg-destructive px-1.5 py-0.5 text-xs text-destructive-foreground">{!r.iban && !r.bic ? 'IBAN + BIC ontbreken' : !r.iban ? 'IBAN ontbreekt' : 'BIC ontbreekt'}</span>}<div className="text-xs font-normal text-muted-foreground sm:hidden">{r.vat_number}</div></td>
        <td className="hidden whitespace-nowrap font-mono text-xs text-muted-foreground sm:table-cell">{r.vat_number ?? '—'}</td>
        <td className="hidden md:table-cell">{PAYMENT_METHODS[r.payment_method as keyof typeof PAYMENT_METHODS]}</td>
        <td className="hidden md:table-cell">{VAT_RULES[r.vat_rule as keyof typeof VAT_RULES]}</td>
        <td className="text-right font-mono">{r.vat_deductible_percent}%</td>
        <td className="text-right"><Button variant="outline" size="sm" onClick={()=>setEdit(r)}>Bewerken</Button></td>
      </tr>)}</tbody>
    </table></div>
    {edit && <section className="space-y-4 border-t pt-4"><h2 className="text-xl font-bold">{edit.name}</h2><div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="supplier-name">Naam</Label><Input id="supplier-name" value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></div>
      <div><Label htmlFor="supplier-vat">Btw-nummer</Label><Input id="supplier-vat" value={edit.vat_number??''} onChange={e=>setEdit({...edit,vat_number:e.target.value||null})}/></div>
      <div><Label htmlFor="supplier-iban">IBAN</Label><Input id="supplier-iban" value={edit.iban??''} onChange={e=>setEdit({...edit,iban:e.target.value||null})}/></div>
      <div><Label htmlFor="supplier-bic">BIC</Label><Input id="supplier-bic" value={edit.bic??''} onChange={e=>setEdit({...edit,bic:e.target.value.toUpperCase()||null})}/></div>
      {supplierBankWarnings(edit).length>0 && <p className="text-sm font-bold text-destructive sm:col-span-2">⚠ {supplierBankWarnings(edit).join(' · ')} — nodig om te betalen.</p>}
      <div><Label htmlFor="supplier-payment">Standaard betaalwijze</Label><select id="supplier-payment" className="h-10 w-full rounded-md border bg-background px-3" value={edit.payment_method} onChange={e=>setEdit({...edit,payment_method:e.target.value})}>{Object.entries(PAYMENT_METHODS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div><Label htmlFor="supplier-rule">Btw-regel</Label><select id="supplier-rule" className="h-10 w-full rounded-md border bg-background px-3" value={edit.vat_rule} onChange={e=>setEdit({...edit,vat_rule:e.target.value})}>{Object.entries(VAT_RULES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div><Label htmlFor="supplier-deductible">Btw aftrekbaar (%)</Label><Input id="supplier-deductible" type="number" min="0" max="100" value={edit.vat_deductible_percent} onChange={e=>setEdit({...edit,vat_deductible_percent:Number(e.target.value)})}/></div>
    </div><div className="flex gap-2"><Button disabled={busy} onClick={submit}>Opslaan</Button><Button variant="outline" onClick={()=>setEdit(null)}>Annuleren</Button></div></section>}
  </div>;
}