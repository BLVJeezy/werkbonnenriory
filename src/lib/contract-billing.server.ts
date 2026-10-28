import { contractTotals } from './contract-billing';
import { formatAddress } from './address';
import { sendOne } from './invoices.functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
export async function processContractBilling(sb: SupabaseClient<Database>, send = true) {
  const {data:jobs,error}=await sb.from('contract_billing_queue').select('*').in('status',['pending','created','error']).order('created_at').limit(10);
  if(error)throw error;
  let created=0,sent=0;
  for(const job of jobs??[]) {
    const now=new Date().toISOString();
    const {data:claim,error:claimError}=await sb.from('contract_billing_queue').update({lease_until:new Date(Date.now()+300000).toISOString()}).eq('work_order_id',job.work_order_id).or(`lease_until.is.null,lease_until.lt.${now}`).select('*').maybeSingle();
    if(claimError)throw claimError;
    if(!claim)continue;
    try {
      let invoiceId=job.invoice_id;
      if(!invoiceId){
        const {data:c,error:ce}=await sb.from('contracts').select('*, customers(*)').eq('id',job.contract_id).single();
        if(ce||!c)throw new Error('Contract niet gevonden');
        const {data:wo,error:we}=await sb.from('work_orders').select('number,scheduled_date,status').eq('id',job.work_order_id).single();
        if(we||!wo||wo.status!=='afgetekend')throw new Error('Beurt niet afgerond');
        const k=c.customers;
        if(!k)throw new Error('Contractklant ontbreekt');
        const t=contractTotals(c.billing_lines);
        const customer={name:k.name,address:formatAddress(k),street:k.street,houseNumber:k.house_number,postalCode:k.postal_code,city:k.city,email:k.billing_email||k.email,vatNumber:k.vat_number,siteAddress:null};
        if(!customer.email)throw new Error('Facturatie-e-mailadres ontbreekt bij de contractklant');
        const {data:id,error:ie}=await sb.rpc('create_contract_completion_invoice',{p_work_order:job.work_order_id,p_customer:customer as Json,p_lines:t.lines as unknown as Json,p_net:t.net,p_vat:t.vat,p_total:t.total,p_vat_rate:t.vatRate,p_reference:`Contract ${c.number??c.name} — beurt ${wo.scheduled_date??''} — werkbon #${wo.number}`});
        if(ie||!id)throw new Error(ie?.message??'Factuur maken mislukt');
        invoiceId=id;created++;
      }
      if(send){
        const {data:inv,error:ie}=await sb.from('invoices').select('*').eq('id',invoiceId).single();
        if(ie||!inv)throw new Error('Factuur niet gevonden');
        const result=await sendOne(sb,inv);
        if(!result.ok)throw new Error(result.error);
        sent++;
      }
      const {error:se}=await sb.from('contract_billing_queue').update({invoice_id:invoiceId,status:send?'sent':'created',error:null,lease_until:null,updated_at:new Date().toISOString()}).eq('work_order_id',job.work_order_id);
      if(se)throw se;
    }catch(e){await sb.from('contract_billing_queue').update({status:'error',error:e instanceof Error?e.message:String(e),lease_until:null}).eq('work_order_id',job.work_order_id);}
  }
  return {created,sent};
}