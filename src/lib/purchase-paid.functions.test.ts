import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  let validate = (input: unknown) => input;
  const b = { middleware: () => b, inputValidator: (fn: typeof validate) => { validate = fn; return b; }, handler: (fn: (arg: { data: unknown; context: unknown }) => unknown) => (arg: { data: unknown; context: unknown }) => fn({ ...arg, data: validate(arg.data) }) }; return b;
} }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
import { markPurchaseInvoicePaid, paymentFile } from './purchase-invoices.functions';
type Run = (input: unknown) => Promise<unknown>;
const id = '788b65a0-35f5-47b7-881d-25a1280312b3';
function fixture(status = 'goedgekeurd', admin = true, kind = 'factuur') {
  const row = { id, status, kind, paid_at: null, total: 121, payment_method: 'overschrijving' };
  const patches: unknown[] = [];
  const tables: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    const q = { select: () => q, eq: () => q, neq: () => q, in: () => q,
      update: (patch: Record<string, unknown>) => { patches.push(patch); Object.assign(row, patch); return q; },
      single: async () => ({ data: row, error: null }),
      then: (resolve: (result: unknown) => unknown) => resolve({ data: [row], error: null }) };
    return q;
  });
  return { row, patches, tables, from, context: { userId: 'admin', supabase: { rpc: async () => ({ data: admin }), from } } };
}
afterEach(() => vi.useRealTimers());
describe('Aankoopfactuur al betaald', () => {
  it.each(['te_controleren', 'goedgekeurd', 'betaling_klaargezet'])('markeert %s betaald zonder betaling of boeking', async status => {
    const f = fixture(status);
    await (markPurchaseInvoicePaid as unknown as Run)({ context: f.context, data: { id, paidDate: '2026-11-10', confirmed: true } });
    expect(f.patches).toEqual([{ status: 'betaald', paid_at: '2026-11-10T12:00:00.000Z' }]);
    expect(f.tables).toEqual(['purchase_invoices', 'purchase_invoices']);
    await expect((paymentFile as unknown as Run)({ context: f.context, data: { ids: [id] } })).rejects.toThrow('Enkel goedgekeurde facturen');
  });
  it('houdt een bestaande betaalregistratie ongewijzigd', async () => {
    const f = fixture('betaald');
    await (markPurchaseInvoicePaid as unknown as Run)({ context: f.context, data: { id, paidDate: '2026-11-10', confirmed: true } });
    expect(f.patches).toEqual([]);
  });
  it('weigert zonder expliciete bevestiging', async () => {
    const f = fixture();
    await expect((markPurchaseInvoicePaid as unknown as Run)({ context: f.context, data: { id, paidDate: '2026-11-10', confirmed: false } })).rejects.toThrow();
    expect(f.from).not.toHaveBeenCalled();
  });
  it('weigert een niet-beheerder', async () => {
    const f = fixture('goedgekeurd', false);
    await expect((markPurchaseInvoicePaid as unknown as Run)({ context: f.context, data: { id, paidDate: '2026-11-10', confirmed: true } })).rejects.toThrow('Alleen voor beheerder');
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(['2026-02-30', '2099-01-01'])('weigert ongeldige of toekomstige betaaldatum %s', async paidDate => {
    const f = fixture();
    await expect((markPurchaseInvoicePaid as unknown as Run)({ context: f.context, data: { id, paidDate, confirmed: true } })).rejects.toThrow('geldige betaaldatum');
    expect(f.patches).toEqual([]);
  });
  it('markeert een creditnota niet als betaalde factuur', async () => {
    const f = fixture('goedgekeurd', true, 'creditnota');
    await expect((markPurchaseInvoicePaid as unknown as Run)({ context: f.context, data: { id, paidDate: '2026-11-10', confirmed: true } })).rejects.toThrow('creditnota');
    expect(f.patches).toEqual([]);
  });
});