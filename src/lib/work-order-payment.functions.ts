import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { removePaymentPatch } from './work-order-payment';

export const removeWorkOrderPayment = createServerFn({ method:'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{id:string})=>{if(!i.id)throw new Error('Werkbon ontbreekt');return i;})
  .handler(async ({data,context})=>{
    const {data:admin,error:roleError}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
    if(roleError || !admin)throw new Error('Alleen de beheerder kan een betaling verwijderen');
    const {data:row,error}=await context.supabase.from('work_orders').update(removePaymentPatch()).eq('id',data.id).select('id').single();
    if(error || !row)throw new Error('Betaling verwijderen mislukt');
    return {ok:true};
  });