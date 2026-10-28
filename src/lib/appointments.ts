import { z } from 'zod';
export const tokenInput = z.object({token:z.string().uuid()});
export const appointmentSlotInput=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),from:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),until:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)}).refine(i=>i.from<i.until,'Het einduur moet na het beginuur liggen');
export type AppointmentSlot=z.infer<typeof appointmentSlotInput>;
export const appointmentSlotsInput=z.array(appointmentSlotInput).min(1).max(10);
export function appointmentSlots(value:unknown):AppointmentSlot[]{const result=z.array(appointmentSlotInput).safeParse(value);return result.success?result.data:[];}
export function slotLabel(s:AppointmentSlot){return `${s.date.split('-').reverse().join('/')} · ${s.from}–${s.until}`;}
export const proposalInput = tokenInput.extend({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),from:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),until:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)}).refine(i=>i.from<i.until,'Het einduur moet na het beginuur liggen');
export const appointmentStatuses: Record<string,string> = {crew_pending:'Wacht op datum van ploeg',customer_pending:'Wacht op bevestiging klant',confirmed:'Afspraak bevestigd'};
/** Only descriptions and quantities; never serialize quote prices or totals. */
export function appointmentInstruction(description:string|null,lines:unknown):string {
 if(!Array.isArray(lines))return description?.trim().slice(0,4000)??'';
 const text=lines.flatMap((line)=>{
  if(!line || typeof line!=='object' || typeof line.description!=='string' || line.unit==='km')return [];
  const desc=line.description.trim();if(!desc)return [];
  const quantity=typeof line.quantity==='number' && Number.isFinite(line.quantity)?`${line.quantity} ${typeof line.unit==='string'?line.unit:''}`.trim():'';
  return [`- ${desc}${quantity?`: ${quantity}`:''}`];
 }).join('\n');
 return (text || description?.trim() || '').slice(0,4000);
}
export function appointmentView(r:{status:string;proposed_date:string|null;time_from:string|null;time_until:string|null;instruction:string;crew_slots?:unknown;customer_slots?:unknown},w:{customer_name:string;address:string|null},crew:boolean){
 const options=appointmentSlots(r.crew_slots);const slots=options.length?options:r.proposed_date && r.time_from && r.time_until?[{date:r.proposed_date,from:r.time_from.slice(0,5),until:r.time_until.slice(0,5)}]:[];
 return {status:r.status,date:r.proposed_date,from:r.time_from?.slice(0,5)??null,until:r.time_until?.slice(0,5)??null,slots,customer:w.customer_name,address:w.address,...(crew?{instruction:r.instruction,customerSlots:appointmentSlots(r.customer_slots)}:{})};
}