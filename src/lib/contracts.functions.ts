import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { contractLineSchema, contractTotals, sourceContractLines } from './contract-billing';
import { formatAddress } from './address';
import type { RepeatUnit } from './recurrence';
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

export const downloadContractPdf = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!admin) throw new Error('Alleen beheerder');
    const [{ data: contract, error }, { data: settings }] = await Promise.all([
      context.supabase.from('contracts').select('*, customers(*)').eq('id', data.id).single(),
      context.supabase.from('settings').select('company_name,company_vat,base_address,km_rate').limit(1).maybeSingle(),
    ]);
    if (error || !contract) throw new Error('Contract niet gevonden');
    const rawLines = Array.isArray(contract.billing_lines) && contract.billing_lines.length > 0
      ? z.array(contractLineSchema).safeParse(contract.billing_lines)
      : { success: false as const };
    const lines = rawLines.success ? rawLines.data : sourceContractLines(contract.source_data);
    const { createContractPdf } = await import('./contract-pdf');
    const bytes = await createContractPdf({
      number: contract.number,
      name: contract.name,
      date: new Date().toISOString().slice(0, 10),
      startDate: contract.next_date,
      endDate: contract.end_date,
      repeatEvery: contract.repeat_every,
      repeatUnit: contract.repeat_unit as RepeatUnit,
      repeatOrdinal: contract.repeat_ordinal,
      repeatWeekday: contract.repeat_weekday,
      description: contract.description,
      company: {
        name: settings?.company_name ?? 'Riory BV',
        vat: settings?.company_vat ?? 'BE0840931404',
        address: settings?.base_address ?? 'Natveld 47, 3740 Bilzen',
        kmRate: settings?.km_rate ?? 1.45,
      },
      customer: {
        name: contract.customers?.name ?? contract.customer_name,
        address: contract.customers ? formatAddress(contract.customers) : null,
        vatNumber: contract.customers?.vat_number ?? null,
        email: contract.customers?.email ?? contract.customers?.billing_email ?? null,
      },
      lines,
      fallbackAmount: contract.invoice_amount,
    });
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    const slug = (contract.number || contract.customer_name || 'contract').replace(/[^a-zA-Z0-9_-]+/g, '-');
    return { pdfBase64: btoa(bin), filename: `Onderhoudscontract-${slug}.pdf` };
  });