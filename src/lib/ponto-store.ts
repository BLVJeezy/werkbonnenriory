import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/** Bank transactions are immutable: a refresh inserts only previously unseen keys. */
export async function storePontoTransactions(
  supabase: SupabaseClient<Database>,
  rows: Database['public']['Tables']['ponto_transactions']['Insert'][],
) {
  if (!rows.length) return;
  const { error } = await supabase.from('ponto_transactions').upsert(rows, {
    onConflict: 'transaction_key',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);
}