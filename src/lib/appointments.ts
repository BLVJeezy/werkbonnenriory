import { z } from 'zod';
export const tokenInput = z.object({token:z.string().uuid()});
export const proposalInput = tokenInput.extend({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),from:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),until:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)}).refine(i=>i.from<i.until,'Het einduur moet na het beginuur liggen');
export const appointmentStatuses: Record<string,string> = {crew_pending:'Wacht op datum van ploeg',customer_pending:'Wacht op bevestiging klant',confirmed:'Afspraak bevestigd'};
export function appointmentView(r:{status:string;proposed_date:string|null;time_from:string|null;time_until:string|null;instruction:string},w:{customer_name:string;address:string|null},crew:boolean){
 return {status:r.status,date:r.proposed_date,from:r.time_from?.slice(0,5)??null,until:r.time_until?.slice(0,5)??null,customer:w.customer_name,address:w.address,...(crew?{instruction:r.instruction}:{})};
}