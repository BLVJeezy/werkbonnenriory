import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/** Preserve settled payments and instructions already exported to the bank. */
export async function syncSupplierPaymentMethod(client: SupabaseClient<Database>, supplierId: string, method: string) {
  const { error } = await client.from('purchase_invoices')
    .update({ payment_method: method })
    .eq('supplier_id', supplierId)
    .in('status', ['te_controleren', 'goedgekeurd']);
  if (error) throw new Error(error.message);
}