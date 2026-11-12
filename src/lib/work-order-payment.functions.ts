import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { invoicePaidAfterRemoval, removePaymentPatch } from './work-order-payment';

export const removeWorkOrderPayment = createServerFn({ method:'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i:{id:string})=>{if(!i.id)throw new Error('Werkbon ontbreekt');return i;})
  .handler(async ({data,context})=>{
    const {data:admin,error:roleError}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});
    if(roleError || !admin)throw new Error('Alleen de beheerder kan een betaling verwijderen');
    const {data:wo}=await context.supabase.from('work_orders').select('paid_amount,paid_at').eq('id',data.id).single();
    const woPaid=wo?.paid_at?Number(wo.paid_amount??0):0;
    // De betaling die bij facturatie van deze werkbon werd overgenomen, gaat ook van de factuur af; anders blijft ze als betaald staan.
    if(woPaid>0){
      const {data:invs}=await context.supabase.from('invoices').select('id,paid_amount,total,paid_at').eq('kind','factuur').or(`work_order_id.eq.${data.id},extra_work_order_ids.cs.{${data.id}}`);
      for(const inv of invs??[]){
        const paid=invoicePaidAfterRemoval(Number(inv.paid_amount),woPaid);
        const {error:invError}=await context.supabase.from('invoices').update({paid_amount:paid,paid_at:paid+0.005>=Number(inv.total)?inv.paid_at:null}).eq('id',inv.id);
        if(invError)throw new Error('Factuurbetaling bijwerken mislukt');
      }
    }
    const {data:row,error}=await context.supabase.from('work_orders').update(removePaymentPatch()).eq('id',data.id).select('id').single();
    if(error || !row)throw new Error('Betaling verwijderen mislukt');
    return {ok:true};
  });