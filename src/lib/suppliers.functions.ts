import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { PAYMENT_METHODS, VAT_RULES } from './supplier-rules';

export const saveSupplier = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; name: string; vat_number: string | null; iban: string | null; bic?: string | null; payment_method: string; vat_rule: string; vat_deductible_percent: number }) => {
    if (!i.name.trim() || !(i.payment_method in PAYMENT_METHODS) || !(i.vat_rule in VAT_RULES) || !Number.isFinite(i.vat_deductible_percent) || i.vat_deductible_percent < 0 || i.vat_deductible_percent > 100) throw new Error('Controleer naam, betaalwijze en btw-instellingen.');
    return i;
  }).handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!admin) throw new Error('Alleen voor beheerder');
    const { id, ...fields } = data;
    const vat = data.vat_number?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match_key = vat ? `vat:${vat}` : `name:${data.name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
    const { error } = await context.supabase.from('suppliers').update({ ...fields, name: data.name.trim(), match_key }).eq('id', id);
    if (error) throw new Error(error.code === '23505' ? 'Deze leverancier bestaat al.' : error.message);
    // Supplier payment method applies to all its not-yet-settled invoices.
    await context.supabase.from('purchase_invoices').update({ payment_method: data.payment_method }).eq('supplier_id', id).in('status', ['te_controleren', 'goedgekeurd']);
    return { ok: true };
  });