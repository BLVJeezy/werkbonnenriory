import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { appointmentInstruction,appointmentView,proposalInput,tokenInput } from './appointments';

async function instructionForTask(db:any,id:string){
 const [{data:w,error:we},{data:q,error:qe}]=await Promise.all([
  db.from('work_orders').select('description').eq('id',id).single(),
  db.from('quotes').select('lines').eq('work_order_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
 ]);
 if(we || qe)throw new Error('Werkomschrijving ophalen mislukt');
 return appointmentInstruction(w?.description??null,q?.lines);
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
export const readAppointment=createServerFn({method:'GET'}).inputValidator((i:unknown)=>tokenInput.extend({crew:z.boolean()}).parse(i)).handler(async({data})=>{
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {data:r}=await db.from('appointment_requests').select('*').eq(data.crew?'crew_token':'customer_token',data.token).single();if(!r || Date.parse(r.expires_at)<Date.now())throw new Error('Link ongeldig of verlopen');
 const {data:w}=await db.from('work_orders').select('customer_name,technician_id,status,address,use_site_address,site_street,site_house_number,site_postal_code,site_city,street,house_number,postal_code,city').eq('id',r.work_order_id).single();if(!w || w.technician_id!==r.technician_id || w.status==='afgetekend')throw new Error('Afspraak niet meer beschikbaar');const {destinationAddress}=await import('./address');return appointmentView(r,{customer_name:w.customer_name,address:destinationAddress(w)},data.crew);
});
export const proposeAppointment=createServerFn({method:'POST'}).inputValidator((i:unknown)=>proposalInput.parse(i)).handler(async({data})=>{
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data:id,error}=await db.rpc('respond_appointment',{p_token:data.token,p_date:data.date,p_from:data.from,p_until:data.until});if(error || !id)throw new Error(error?.message??'Voorstel mislukt');const {data:r}=await db.from('appointment_requests').select('*').eq('id',id).single();if(!r)throw new Error('Afspraak ontbreekt');const {deliverAppointment}=await import('./appointments.server');return deliverAppointment(r);
});
export const answerAppointment=createServerFn({method:'POST'}).inputValidator((i:unknown)=>tokenInput.extend({accept:z.boolean()}).parse(i)).handler(async({data})=>{
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data:id,error}=await db.rpc('respond_appointment',{p_token:data.token,p_accept:data.accept});if(error || !id)throw new Error(error?.message??'Bevestigen mislukt');const {data:r}=await db.from('appointment_requests').select('*').eq('id',id).single();if(!r)throw new Error('Afspraak ontbreekt');const {deliverAppointment}=await import('./appointments.server');const mail=await deliverAppointment(r);return {ok:true,mailSent:mail.sent};
});