import { describe, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => { const b = { middleware: () => b, inputValidator: () => b, handler: (fn: unknown) => fn }; return b; } }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
import { updatePurchaseInvoice } from './purchase-invoices.functions';
import { saveSupplier } from './suppliers.functions';

function fixture(admin = true, failSync = false) {
  const supplier = { id: 'supplier', name: 'Leverancier', vat_number: null, iban: null, bic: null, payment_method: 'overschrijving' };
  const invoices = ['te_controleren', 'goedgekeurd', 'betaald', 'betaling_klaargezet'].map((status, index) => ({ id: `invoice-${index}`, supplier_id: 'supplier', status, payment_method: 'overschrijving' }));
  invoices.push({ id: 'other', supplier_id: 'other', status: 'te_controleren', payment_method: 'overschrijving' });
  const from = vi.fn((table: string) => {
    let patch: Record<string, unknown> | null = null;
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const q = {
      select: () => q,
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return q; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; },
      single: async () => ({ data: supplier, error: null }),
      then: (resolve: (result: unknown) => unknown) => {
        if (failSync && table === 'purchase_invoices' && filters.length === 2 && patch && Object.keys(patch).length === 1) return resolve({ error: { message: 'Synchronisatie mislukt' } });
        if (patch) for (const row of table === 'suppliers' ? [supplier] : invoices) if (filters.every(f => f(row))) Object.assign(row, patch);
        return resolve({ error: null });
      },
    }; return q;
  });
  return { supplier, invoices, from, context: { userId: 'admin', supabase: { rpc: async () => ({ data: admin }), from } } };
}
type Run = (arg: unknown) => Promise<{ supplierSyncError?: string | null }>;
describe('Leveranciersbetaalwijze', () => {
  it.each(['kaart', 'domiciliering', 'cash', 'overschrijving'])('wijziging op een aankoopfactuur neemt %s over op leverancier en andere open facturen', async method => {
    const f = fixture();
    await (updatePurchaseInvoice as unknown as Run)({ context: f.context, data: { id: 'invoice-0', supplierId: 'supplier', paymentMethod: method, supplierName: 'Leverancier', lines: [], net: 0, vat: 0, total: 0 } });
    expect(f.supplier.payment_method).toBe(method);
    expect(f.invoices.map(r => r.payment_method)).toEqual([method, method, 'overschrijving', 'overschrijving', 'overschrijving']);
  });
  it('meldt een fout bij het overnemen vanaf de leverancierspagina', async () => {
    const f = fixture(true, true);
    await expect((saveSupplier as unknown as Run)({ context: f.context, data: { ...f.supplier, payment_method: 'kaart', vat_rule: 'document', vat_deductible_percent: 100 } })).rejects.toThrow('Synchronisatie mislukt');
  });
  it.each([updatePurchaseInvoice, saveSupplier])('weigert wijzigingen zonder adminrecht', async fn => {
    const f = fixture(false);
    await expect((fn as unknown as Run)({ context: f.context, data: {} })).rejects.toThrow('Alleen voor beheerder');
    expect(f.from).not.toHaveBeenCalled();
  });
});