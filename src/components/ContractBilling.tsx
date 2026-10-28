import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from './ui/dialog';
import { contractTotals,sourceContractLines,type ContractLine } from '@/lib/contract-billing';
import { saveContractBilling,retryContractBilling } from '@/lib/contracts.functions';
import { toast } from 'sonner';
import { euro } from '@/lib/billing';
import { Trash2,Plus } from 'lucide-react';
export function ContractBilling({contract}:{contract:{id:string;billing_enabled:boolean;billing_lines:unknown;source_data:unknown}}){
 const qc=useQueryClient(),save=useServerFn(saveContractBilling),retry=useServerFn(retryContractBilling);
 const [open,setOpen]=useState(false),[enabled,setEnabled]=useState(contract.billing_enabled),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
 const [lines,setLines]=useState<ContractLine[]>([]);
 const {data:jobs=[]}=useQuery({queryKey:['contract-billing',contract.id],queryFn:async()=>{const {data,error}=await supabase.from('contract_billing_queue').select('*,invoices(number,status)').eq('contract_id',contract.id).order('created_at',{ascending:false});if(error)throw error;return data??[];},refetchInterval:15000});
 let total:number|null=null;try{total=contractTotals(lines).total;}catch{}
 const change=(i:number,patch:Partial<ContractLine>)=>{setLines(a=>a.map((l,j)=>j===i?{...l,...patch}:l));setConfirmed(false);};
 return <div className="mt-3 space-y-2 border-t pt-3">
  <p className="font-semibold">Facturatie: {contract.billing_enabled?'automatisch na elke beurt':'niet geactiveerd'}</p>
  <Button size="sm" variant="outline" onClick={()=>{setLines(Array.isArray(contract.billing_lines)&&contract.billing_lines.length?contract.billing_lines as ContractLine[]:sourceContractLines(contract.source_data));setEnabled(contract.billing_enabled);setConfirmed(false);setOpen(true);}}>Facturatie instellen</Button>
  {jobs.map(j=><div key={j.work_order_id} className="break-words text-xs">{j.invoices?.number??'Nog geen factuur'} · {j.status==='sent'?'Verzonden':j.status==='created'?'Aangemaakt':j.status==='error'?'Fout':'Wacht op verwerking'}{j.error&&<p className="text-destructive">{j.error}</p>}</div>)}
  {jobs.some(j=>j.status==='error')&&<Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await retry();await qc.invalidateQueries({queryKey:['contract-billing']});}catch(e){toast.error(e instanceof Error?e.message:'Verwerking mislukt');}finally{setBusy(false);}}}>Verwerking opnieuw proberen</Button>}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogTitle>Facturatie per uitgevoerde beurt</DialogTitle><DialogDescription>Bedragen exclusief btw. Alleen nieuwe afrondingen na activering worden gefactureerd; oorspronkelijke contractregels blijven bewaard.</DialogDescription>
   <Label className="flex gap-2"><Checkbox checked={enabled} onCheckedChange={v=>setEnabled(v===true)}/>Automatisch factureren én versturen na elke beurt</Label>
   {lines.map((l,i)=><div key={i} className="grid grid-cols-2 gap-2 border-b pb-3 sm:grid-cols-6">
    <div className="col-span-2 sm:col-span-6"><Label>Omschrijving</Label><Input aria-label={`Omschrijving regel ${i+1}`} value={l.description} onChange={e=>change(i,{description:e.target.value})}/></div>
    <div><Label>Aantal</Label><Input aria-label={`Aantal regel ${i+1}`} type="number" min="0.001" step="any" value={l.quantity} onChange={e=>change(i,{quantity:Number(e.target.value)})}/></div>
    <div><Label>Eenheid</Label><Input value={l.unit} onChange={e=>change(i,{unit:e.target.value})}/></div>
    <div><Label>Prijs</Label><Input aria-label={`Prijs regel ${i+1}`} type="number" min="0" step="0.01" value={l.unitPrice} onChange={e=>change(i,{unitPrice:Number(e.target.value)})}/></div>
    <div><Label>Korting %</Label><Input type="number" min="0" max="100" value={l.discount} onChange={e=>change(i,{discount:Number(e.target.value)})}/></div>
    <div><Label>Btw %</Label><select aria-label={`Btw regel ${i+1}`} className="h-10 w-full rounded border bg-background text-foreground" value={l.vatRate} onChange={e=>change(i,{vatRate:Number(e.target.value) as ContractLine['vatRate']})}>{[0,6,12,21].map(v=><option key={v} value={v}>{v}%</option>)}</select></div>
    <Button variant="outline" size="icon" title="Regel verwijderen" onClick={()=>setLines(a=>a.filter((_,j)=>j!==i))}><Trash2 className="h-4 w-4"/></Button>
   </div>)}
   <Button variant="outline" onClick={()=>setLines(a=>[...a,{description:'',quantity:1,unit:'stuk',unitPrice:0,discount:0,vatRate:21}])}><Plus className="h-4 w-4"/>Regel toevoegen</Button>
   <p className="font-bold">Totaal per beurt incl. btw: {total===null?'Controleer de regels':euro(total)}</p>
   <Label className="flex gap-2"><Checkbox checked={confirmed} onCheckedChange={v=>setConfirmed(v===true)}/>Ik bevestig dat deze regels en bedragen volgens het contract per uitgevoerde beurt gelden.</Label>
   <Button disabled={busy||(enabled&&(!confirmed||total===null))} onClick={async()=>{setBusy(true);try{await save({data:{id:contract.id,enabled,confirmed,lines}});await qc.invalidateQueries({queryKey:['contracts']});toast.success('Contractfacturatie opgeslagen');setOpen(false);}catch(e){toast.error(e instanceof Error?e.message:'Opslaan mislukt');}finally{setBusy(false);}}}>Opslaan</Button>
  </DialogContent></Dialog>
 </div>;
}