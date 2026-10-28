import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { appointmentInstruction,appointmentSlotInput,appointmentSlotsInput,appointmentView,proposalInput,tokenInput } from './appointments';

async function instructionForTask(db:any,id:string){
 const [{data:w,error:we},{data:q,error:qe}]=await Promise.all([
  db.from('work_orders').select('description').eq('id',id).single(),
  db.from('quotes').select('lines').eq('work_order_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
 ]);
 if(we || qe)throw new Error('Werkomschrijving ophalen mislukt');
 const {data:prods}=await db.from('products').select('name,alias').not('alias','is',null);
 const aliases:Record<string,string>={};for(const p of prods??[])if(p.alias?.trim())aliases[p.name.trim().toLowerCase()]=p.alias.trim();
 return appointmentInstruction(w?.description??null,q?.lines,aliases);
}
export const getAppointmentInstruction=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator((i:unknown)=>z.object({id:z.string().uuid()}).parse(i)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(!admin)throw new Error('Alleen voor beheerder');
 return {instruction:await instructionForTask(context.supabase,data.id)};
});

export const createExternalCrew=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:unknown)=>z.object({name:z.string().trim().min(1).max(100),email:z.string().trim().email().max(254)}).parse(i)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(!admin)throw new Error('Alleen voor beheerder');
 const {error}=await context.supabase.from('technicians').insert({name:data.name,email:data.email,external_planning:true,show_prices:false,can_payment:false,user_id:null});if(error)throw new Error(error.message);return {ok:true};
});
export const forwardAppointment=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:unknown)=>z.object({id:z.string().uuid(),instruction:z.string().trim().min(1).max(4000).optional()}).parse(i)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(!admin)throw new Error('Alleen voor beheerder');
 const {data:w}=await context.supabase.from('work_orders').select('*').eq('id',data.id).single();if(!w || w.status==='afgetekend' || !w.technician_id)throw new Error('Wijs eerst een externe ploeg toe aan een open taak');
 const {data:t}=await context.supabase.from('technicians').select('*').eq('id',w.technician_id).single();if(!t?.external_planning || t.user_id)throw new Error('Deze ploeg is geen externe ploeg');
 const email=z.string().email().parse(w.email);const crewEmail=z.string().email().parse(t.email);
 const instruction=data.instruction??await instructionForTask(context.supabase,data.id);if(!instruction)throw new Error('Deze taak heeft nog geen werkomschrijving');
 const {data:requestId,error:forwardError}=await context.supabase.rpc('forward_external_appointment',{p_id:w.id,p_instruction:instruction});if(forwardError || !requestId)throw new Error(forwardError?.message??'Doorzetten mislukt');
 const {data:r,error}=await context.supabase.from('appointment_requests').select('*').eq('id',requestId).single();if(error || !r)throw new Error('Doorzetten mislukt');
 const {deliverAppointment}=await import('./appointments.server');return deliverAppointment(r);
});
export const retryAppointmentMail=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:unknown)=>z.object({id:z.string().uuid()}).parse(i)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(!admin)throw new Error('Alleen voor beheerder');const {data:r}=await context.supabase.from('appointment_requests').select('*').eq('work_order_id',data.id).single();if(!r || Date.parse(r.expires_at)<Date.now())throw new Error('Zet de afspraak opnieuw door');const {deliverAppointment}=await import('./appointments.server');return deliverAppointment(r);
});
/** Beheerder nodigt de klant uit: de gekozen standaardvakken gaan naar de klant via een keuzelink. */
export const inviteCustomer=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:unknown)=>z.object({id:z.string().uuid(),slots:appointmentSlotsInput}).parse(i)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(!admin)throw new Error('Alleen voor beheerder');
 const instruction=(await instructionForTask(context.supabase,data.id))||'Afspraak inplannen';
 const {data:requestId,error:inviteError}=await context.supabase.rpc('invite_customer_appointment',{p_id:data.id,p_slots:data.slots,p_instruction:instruction});if(inviteError || !requestId)throw new Error(inviteError?.message??'Uitnodigen mislukt');
 const {data:r,error}=await context.supabase.from('appointment_requests').select('*').eq('id',requestId).single();if(error || !r)throw new Error('Uitnodigen mislukt');
 const {deliverAppointment}=await import('./appointments.server');return deliverAppointment(r);
});
export const readAppointment=createServerFn({method:'GET'}).inputValidator((i:unknown)=>tokenInput.extend({crew:z.boolean()}).parse(i)).handler(async({data})=>{
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {data:r}=await db.from('appointment_requests').select('*').eq(data.crew?'crew_token':'customer_token',data.token).single();if(!r || Date.parse(r.expires_at)<Date.now())throw new Error('Link ongeldig of verlopen');
 const {data:w}=await db.from('work_orders').select('customer_name,technician_id,status,address,use_site_address,site_street,site_house_number,site_postal_code,site_city,street,house_number,postal_code,city').eq('id',r.work_order_id).single();if(!w || w.technician_id!==r.technician_id || w.status==='afgetekend')throw new Error('Afspraak niet meer beschikbaar');const {destinationAddress}=await import('./address');return appointmentView(r,{customer_name:w.customer_name,address:destinationAddress(w)},data.crew);
});
export const proposeAppointment=createServerFn({method:'POST'}).inputValidator((i:unknown)=>{
 const multiple=tokenInput.extend({slots:appointmentSlotsInput}).safeParse(i);if(multiple.success)return multiple.data;
 const single=proposalInput.parse(i);return {token:single.token,slots:[{date:single.date,from:single.from,until:single.until}]};
}).handler(async({data})=>{
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data:id,error}=await db.rpc('respond_appointment_options',{p_token:data.token,p_action:'propose',p_slots:data.slots});if(error || !id)throw new Error(error?.message??'Voorstel mislukt');const {data:r}=await db.from('appointment_requests').select('*').eq('id',id).single();if(!r)throw new Error('Afspraak ontbreekt');const {deliverAppointment}=await import('./appointments.server');return deliverAppointment(r);
});
export const answerAppointment=createServerFn({method:'POST'}).inputValidator((i:unknown)=>tokenInput.extend({accept:z.boolean(),choice:z.number().int().min(0).max(9).optional(),slots:z.array(appointmentSlotInput).max(10).optional()}).parse(i)).handler(async({data})=>{
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data:id,error}=await db.rpc('respond_appointment_options',{p_token:data.token,p_action:data.accept?'accept':'reject',p_choice:data.choice??0,p_slots:data.slots??[]});if(error || !id)throw new Error(error?.message??'Bevestigen mislukt');const {data:r}=await db.from('appointment_requests').select('*').eq('id',id).single();if(!r)throw new Error('Afspraak ontbreekt');const {deliverAppointment}=await import('./appointments.server');const mail=await deliverAppointment(r);return {ok:true,mailSent:mail.sent};
});