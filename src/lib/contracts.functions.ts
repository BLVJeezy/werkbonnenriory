import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { contractLineSchema, contractTotals } from './contract-billing';
const schema=z.object({id:z.string().uuid(),enabled:z.boolean(),confirmed:z.boolean(),lines:z.array(contractLineSchema)});
export const saveContractBilling=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(i=>schema.parse(i)).handler(async({data,context})=>{
 const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
 if(!admin)throw new Error('Alleen beheerder');
 if(data.enabled){if(!data.confirmed)throw new Error('Bevestig de bedragen per uitgevoerde beurt');contractTotals(data.lines);}
 const {error}=await context.supabase.from('contracts').update({billing_lines:data.lines,billing_enabled:data.enabled}).eq('id',data.id);
 if(error)throw error;
 return {ok:true};
});
export const retryContractBilling=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data:admin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
 if(!admin)throw new Error('Alleen beheerder');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {processContractBilling}=await import('./contract-billing.server');
 return processContractBilling(supabaseAdmin);
});