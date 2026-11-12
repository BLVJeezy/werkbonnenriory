import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
import { getInterventionPage, getSimplaMapLocations, saveInterventionCoordinates, geocodeInterventionBatch } from './intervention-map.functions';
const read = getInterventionPage as unknown as (args: unknown) => Promise<unknown>;
const save = saveInterventionCoordinates as unknown as (args: unknown) => Promise<unknown>;
const lookup = geocodeInterventionBatch as unknown as (args: unknown) => Promise<unknown>;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const googleKeys = () => { vi.stubEnv('GOOGLE_MAPS_API_KEY', 'connection-key'); vi.stubEnv('LOVABLE_API_KEY', 'lovable-key'); };
const workOrders = { select: () => workOrders, eq: () => workOrders, in: async () => ({ data: [{ address: 'Kerkstraat 12, 9000 Gent' }], error: null }) };
const locations = () => { const table = { update: () => table, eq: vi.fn() }; table.eq.mockReturnValueOnce(table).mockResolvedValueOnce({ error: null }); return table; };
describe('Interventiekaart servergrenzen', () => {
  it('leest bestaande klantprojecten en behoudt alle 3045 Simpla-klantadressen', async () => {
    vi.stubEnv('SIMPLA_API_TOKEN', 'test-token');
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => ({ ok: true, json: async () => ({ status: 'OK', data: url.searchParams.get('dataType') === 'customer' ? Array.from({ length: 3045 }, (_, i) => ({ customerId: i + 1, customerName: `Klant ${i}`, customerStreetNr: `Kerkstraat ${i + 1}`, customerPostal: '9000', customerCity: 'Gent' })) : [] }) })));
    const from = vi.fn((table: string) => {
      if (table === 'intervention_source_snapshots') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ error: null }) };
      if (table === 'customer_projects') return { select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) };
      if (table === 'intervention_locations') return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      throw new Error(`Onbekende tabel ${table}`);
    });
    const run = getSimplaMapLocations as unknown as (args: unknown) => Promise<{ rows: unknown[]; error: string | null }>;
    const result = await run({ context: { userId: 'admin', supabase: { rpc: async () => ({ data: true, error: null }), from } } });
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(3045);
    expect(from).toHaveBeenCalledWith('customer_projects');
  });
  it.each([['lijst',read,{offset:0}],['Simpla',getSimplaMapLocations as unknown as (args:unknown)=>Promise<unknown>,{}],['opslaan',save,{id:'id',lat:51,lon:5}],['geocoderen',lookup,{ids:['id'],refs:[]}]] as const)('weigert niet-admin vóór adreslezen of externe actie: %s', async (_name,run,data) => {
    const from = vi.fn(); const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
    await expect(run({data,context:{userId:'user',supabase:{rpc:async()=>({data:false,error:null}),from}}})).rejects.toThrow('Alleen beheerders');
    expect(from).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('weigert geocoding zonder gekoppelde Google Maps zonder externe verzoeken',async()=>{
    vi.stubEnv('GOOGLE_MAPS_API_KEY',''); vi.stubEnv('LOVABLE_API_KEY','');
    const fetch = vi.fn(); const from=vi.fn(); vi.stubGlobal('fetch',fetch);
    await expect(lookup({data:{ids:['id'],refs:[]},context:{userId:'admin',supabase:{rpc:async()=>({data:true,error:null}),from}}})).rejects.toThrow('Google Maps');
    expect(fetch).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
  });
  it('hergebruikt gecachte locaties zonder geocoderverzoek',async()=>{
    googleKeys();
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:'cached',error:null});
    expect(await lookup({data:{ids:['id'],refs:[]},context:{userId:'admin',supabase:{rpc,from:()=>workOrders}}})).toEqual({found:0,failed:0,stopped:null});expect(fetch).not.toHaveBeenCalled();
  });
  it('stopt bij globaal dagbudget vóór externe verzoeken',async()=>{
    googleKeys(); vi.stubEnv('INTERVENTION_GEOCODER_DAILY_LIMIT','5');
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:'budget',error:null});
    expect(await lookup({data:{ids:['id'],refs:[]},context:{userId:'admin',supabase:{rpc,from:()=>workOrders}}})).toEqual({found:0,failed:0,stopped:'budget'});expect(fetch).not.toHaveBeenCalled();
  });
  it('slaagt en bewaart enkel een exact adres uit het Google-antwoord',async()=>{
    googleKeys();
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'OK',results:[{geometry:{location:{lat:50.85,lng:4.35},location_type:'ROOFTOP'}}]})});vi.stubGlobal('fetch',fetch);
    const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:'claimed',error:null});
    const tables: Record<string,unknown> = { work_orders: workOrders, intervention_locations: locations() };
    expect(await lookup({data:{ids:['id'],refs:[]},context:{userId:'admin',supabase:{rpc,from:(table:string)=>tables[table]}}})).toEqual({found:1,failed:0,stopped:null});
    expect(fetch).toHaveBeenCalledOnce();
    const [url,init] = fetch.mock.calls[0] as [string,RequestInit];
    expect(url).toContain('connector-gateway.lovable.dev/google_maps/maps/api/geocode/json');
    expect(url).toContain(encodeURIComponent('Kerkstraat 12, 9000 Gent'));
    expect((init.headers as Record<string,string>)['X-Connection-Api-Key']).toBe('connection-key');
  });
  it('verwerpt bij-benadering-resultaten zoals een gemeentecentrum',async()=>{
    googleKeys();
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'OK',results:[{geometry:{location:{lat:50.85,lng:4.35},location_type:'APPROXIMATE'}}]})});vi.stubGlobal('fetch',fetch);
    const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:'claimed',error:null});
    const tables: Record<string,unknown> = { work_orders: workOrders, intervention_locations: locations() };
    expect(await lookup({data:{ids:['id'],refs:[]},context:{userId:'admin',supabase:{rpc,from:(table:string)=>tables[table]}}})).toEqual({found:0,failed:1,stopped:null});
  });
});
