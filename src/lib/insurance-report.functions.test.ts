import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => { const b = { middleware: () => b, inputValidator: () => b, handler: (fn: unknown) => fn }; return b; } }));
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('http://localhost') }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
const ai = vi.hoisted(() => vi.fn());
vi.mock('./ai/responses.server', () => ({ createResponsesCall: ai }));
import { generateInsuranceReport, saveInsuranceReport } from './insurance-report.functions';
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe('Verzekeringsverslag', () => {
  it('verbruikt de AI-stream vóór het eindresultaat en gebruikt de techniekerbevindingen', async () => {
    vi.stubEnv('LOVABLE_API_KEY', 'test-key');
    let consumed = false;
    ai.mockReturnValue({ result: { consumeStream: async () => { consumed = true; }, get output() { if (!consumed) throw new Error('Stream niet verbruikt'); return Promise.resolve({ text: 'Lek vastgesteld; geen verstopping.' }); } } });
    const from = (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: table === 'settings' ? { insurance_report_ai_denial: null } : { status: 'afgetekend', work_notes: 'Lek; geen verstopping', description: 'Afvoer nakijken' }, error: null }) }) }) });
    const run = generateInsuranceReport as unknown as (arg: unknown) => Promise<unknown>;
    expect(await run({ data: { workOrderId: 'id' }, context: { userId: 'admin', supabase: { rpc: async () => ({ data: true }), from } } })).toEqual({ text: 'Lek vastgesteld; geen verstopping.', error: null });
    expect(consumed).toBe(true);
    expect(ai.mock.calls[0]?.[2][0].content).toContain('Lek; geen verstopping');
  });
  it.each([generateInsuranceReport, saveInsuranceReport])('weigert niet-admin vóór lezen of schrijven', async fn => {
    const from = vi.fn();
    const run = fn as unknown as (arg: unknown) => Promise<unknown>;
    await expect(run({ data: { workOrderId: 'id', text: 'Verslag' }, context: { userId: 'crew', supabase: { rpc: async () => ({ data: false }), from } } })).rejects.toThrow('Alleen voor beheerder');
    expect(from).not.toHaveBeenCalled(); expect(ai).not.toHaveBeenCalled();
  });
  it('genereert niets zonder techniekerbevindingen', async () => {
    const from = (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: table === 'settings' ? { insurance_report_ai_denial: null } : { status: 'afgetekend', work_notes: '' }, error: null }) }) }) });
    const run = generateInsuranceReport as unknown as (arg: unknown) => Promise<{ error: string }>;
    const result = await run({ data: { workOrderId: 'id' }, context: { userId: 'admin', supabase: { rpc: async () => ({ data: true }), from } } });
    expect(result.error).toContain('bevindingen'); expect(ai).not.toHaveBeenCalled();
  });
  it('respecteert een opgeslagen toegangsweigering zonder AI-aanroep', async () => {
    const from = () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { insurance_report_ai_denial: { message: 'Toegang geweigerd' } }, error: null }) }) }) });
    const run = generateInsuranceReport as unknown as (arg: unknown) => Promise<unknown>;
    expect(await run({ data: { workOrderId: 'id' }, context: { userId: 'admin', supabase: { rpc: async () => ({ data: true }), from } } })).toEqual({ text: null, error: 'Toegang geweigerd' });
    expect(ai).not.toHaveBeenCalled();
  });
});