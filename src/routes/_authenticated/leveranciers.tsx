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
import type { Database } from '@/integrations/supabase/types';
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
  async function submit() {
    if (!edit) return; setBusy(true);
    try { await save({ data: edit }); await qc.invalidateQueries({ queryKey: ['suppliers'] }); setEdit(null); toast.success('Leverancier opgeslagen'); }
    catch(e) { toast.error(e instanceof Error ? e.message : 'Opslaan mislukt'); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black uppercase">Leveranciers</h1></div>
    <Input aria-label="Leverancier zoeken" placeholder="Leverancier zoeken" value={search} onChange={e=>setSearch(e.target.value)} />
    <ul className="divide-y border rounded-md">{rows.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())).map(r=><li key={r.id} className="flex flex-wrap items-center gap-3 p-3"><span className="font-bold">{r.name}</span><span className="text-sm text-muted-foreground">{r.vat_number}</span><span className="text-sm">{PAYMENT_METHODS[r.payment_method as keyof typeof PAYMENT_METHODS]} · {VAT_RULES[r.vat_rule as keyof typeof VAT_RULES]} · {r.vat_deductible_percent}% aftrekbaar</span><Button variant="outline" className="ml-auto" onClick={()=>setEdit(r)}>Bewerken</Button></li>)}</ul>
    {edit && <section className="space-y-4 border-t pt-4"><h2 className="text-xl font-bold">{edit.name}</h2><div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="supplier-name">Naam</Label><Input id="supplier-name" value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></div>
      <div><Label htmlFor="supplier-vat">Btw-nummer</Label><Input id="supplier-vat" value={edit.vat_number??''} onChange={e=>setEdit({...edit,vat_number:e.target.value||null})}/></div>
      <div><Label htmlFor="supplier-iban">IBAN</Label><Input id="supplier-iban" value={edit.iban??''} onChange={e=>setEdit({...edit,iban:e.target.value||null})}/></div>
      <div><Label htmlFor="supplier-payment">Standaard betaalwijze</Label><select id="supplier-payment" className="h-10 w-full rounded-md border bg-background px-3" value={edit.payment_method} onChange={e=>setEdit({...edit,payment_method:e.target.value})}>{Object.entries(PAYMENT_METHODS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div><Label htmlFor="supplier-rule">Btw-regel</Label><select id="supplier-rule" className="h-10 w-full rounded-md border bg-background px-3" value={edit.vat_rule} onChange={e=>setEdit({...edit,vat_rule:e.target.value})}>{Object.entries(VAT_RULES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
      <div><Label htmlFor="supplier-deductible">Btw aftrekbaar (%)</Label><Input id="supplier-deductible" type="number" min="0" max="100" value={edit.vat_deductible_percent} onChange={e=>setEdit({...edit,vat_deductible_percent:Number(e.target.value)})}/></div>
    </div><div className="flex gap-2"><Button disabled={busy} onClick={submit}>Opslaan</Button><Button variant="outline" onClick={()=>setEdit(null)}>Annuleren</Button></div></section>}
  </div>;
}