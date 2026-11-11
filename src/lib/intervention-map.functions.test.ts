import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn }; return builder;
} }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
import { getInterventionPage, saveInterventionCoordinates, geocodeInterventionBatch } from './intervention-map.functions';
const read = getInterventionPage as unknown as (args: unknown) => Promise<unknown>;
const save = saveInterventionCoordinates as unknown as (args: unknown) => Promise<unknown>;
const lookup = geocodeInterventionBatch as unknown as (args: unknown) => Promise<unknown>;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Interventiekaart servergrenzen', () => {
  it.each([['lijst',read,{offset:0}],['opslaan',save,{id:'id',lat:51,lon:5}],['geocoderen',lookup,{ids:['id']}]] as const)('weigert niet-admin vóór adreslezen of externe actie: %s', async (_name,run,data) => {
    const from = vi.fn(); const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
    await expect(run({data,context:{userId:'user',supabase:{rpc:async()=>({data:false,error:null}),from}}})).rejects.toThrow('Alleen beheerders');
    expect(from).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('weigert geocoding zonder expliciete dienst en budget zonder externe verzoeken',async()=>{
    vi.stubEnv('INTERVENTION_GEOCODER_URL',''); vi.stubEnv('INTERVENTION_GEOCODER_DAILY_LIMIT','0');
    const fetch = vi.fn(); const from=vi.fn(); vi.stubGlobal('fetch',fetch);
    await expect(lookup({data:{ids:['id']},context:{userId:'admin',supabase:{rpc:async()=>({data:true,error:null}),from}}})).rejects.toThrow('Geen toegestane');
    expect(fetch).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
  });
  it('hergebruikt gecachte locaties zonder geocoderverzoek',async()=>{
    vi.stubEnv('INTERVENTION_GEOCODER_URL','https://approved.example/geocoder');vi.stubEnv('INTERVENTION_GEOCODER_DAILY_LIMIT','5');
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const q={select:()=>q,eq:()=>q,in:async()=>({data:[{address:'Kerkstraat 12, 9000 Gent'}],error:null})};
    const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:'cached',error:null});
    expect(await lookup({data:{ids:['id']},context:{userId:'admin',supabase:{rpc,from:()=>q}}})).toEqual({found:0,failed:0,stopped:null});expect(fetch).not.toHaveBeenCalled();
  });
  it('stopt bij globaal dagbudget vóór externe verzoeken',async()=>{
    vi.stubEnv('INTERVENTION_GEOCODER_URL','https://approved.example/geocoder');vi.stubEnv('INTERVENTION_GEOCODER_DAILY_LIMIT','5');
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const q={select:()=>q,eq:()=>q,in:async()=>({data:[{address:'Kerkstraat 12, 9000 Gent'}],error:null})};
    const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:'budget',error:null});
    expect(await lookup({data:{ids:['id']},context:{userId:'admin',supabase:{rpc,from:()=>q}}})).toEqual({found:0,failed:0,stopped:'budget'});expect(fetch).not.toHaveBeenCalled();
  });
});