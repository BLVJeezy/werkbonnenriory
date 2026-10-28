import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { forwardAppointment,getAppointmentInstruction,retryAppointmentMail } from '@/lib/appointments.functions';
import { appointmentStatuses } from '@/lib/appointments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
export function AppointmentPanel({id,external,scheduled}:{id:string;external:boolean;scheduled:boolean}){
 const qc=useQueryClient();const forward=useServerFn(forwardAppointment);const retry=useServerFn(retryAppointmentMail);const getInstruction=useServerFn(getAppointmentInstruction);const [editedInstruction,setInstruction]=useState<string|null>(null);const [busy,setBusy]=useState(false);
 const {data:defaults,error:instructionError}=useQuery({queryKey:['appointment_instruction',id],enabled:external,queryFn:()=>getInstruction({data:{id}})});
 const instruction=editedInstruction??defaults?.instruction??'';
 const {data:r}=useQuery({queryKey:['appointment',id],refetchInterval:10000,queryFn:async()=>{const {data}=await supabase.from('appointment_requests').select('status,proposed_date,time_from,time_until,mail_error,mail_pending,expires_at').eq('work_order_id',id).maybeSingle();return data;}});
 async function send(again:boolean){if(!again && (scheduled || r) && !confirm('Bestaande planning of voorstel vervangen? De oude links vervallen.'))return;setBusy(true);try{const result=again?await retry({data:{id}}):await forward({data:{id,...(editedInstruction!==null?{instruction:editedInstruction}:{})}});qc.invalidateQueries({queryKey:['appointment',id]});qc.invalidateQueries({queryKey:['work_orders']});qc.invalidateQueries({queryKey:['work_order',id]});if(result.sent)toast.success('Afspraakmail verstuurd');else toast.error(result.error??'Mail niet verstuurd');}catch(e){toast.error(e instanceof Error?e.message:'Doorzetten mislukt');}finally{setBusy(false);}}
 if(!external && !r)return null;
 return <section className="no-print space-y-3 border-t pt-4"><h2 className="text-lg font-black uppercase">Afspraak door externe ploeg</h2>{r && <><p className="font-bold">{Date.parse(r.expires_at)<Date.now()?'Voorstel vervallen':appointmentStatuses[r.status]}</p>{r.proposed_date && <p>{r.proposed_date} · {r.time_from?.slice(0,5)}–{r.time_until?.slice(0,5)}</p>}{r.mail_error && <p className="text-destructive">{r.mail_error}</p>}{r.mail_pending && <Button variant="outline" disabled={busy} onClick={()=>send(true)}>Afspraakmail opnieuw proberen</Button>}</>}{external && <><Label htmlFor={`instruction-${id}`}>Prijsloze werkomschrijving voor de ploeg</Label><Textarea id={`instruction-${id}`} value={instruction} maxLength={4000} onChange={e=>setInstruction(e.target.value)} />{instructionError && <p className="text-destructive">Werkomschrijving ophalen mislukt.</p>}<Button disabled={busy || !instruction.trim()} onClick={()=>send(false)}>Doorzetten naar ploeg</Button></>}</section>;
}