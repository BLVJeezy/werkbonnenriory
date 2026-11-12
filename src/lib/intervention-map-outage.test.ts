import { afterEach, expect,it,vi } from 'vitest';
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,handler:(fn:unknown)=>fn,inputValidator:()=>b};return b}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('retains project addresses when Simpla connection fails',async()=>{
 vi.stubEnv('SIMPLA_API_TOKEN','test');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('connection')));
 const {getSimplaMapLocations}=await import('./intervention-map.functions');
 const table={select:()=>table,eq:()=>table,maybeSingle:async()=>({data:null,error:null}),order:()=>table,range:async()=>({data:[{id:'project',name:'Project',street:'Kerkstraat',house_number:'12',postal_code:'9000',city:'Gent',created_at:'2026-11-12'}],error:null}),in:async()=>({data:[],error:null})};
 const run=getSimplaMapLocations as unknown as (args:unknown)=>Promise<{rows:unknown[]}>;
 const result=await run({context:{userId:'admin',supabase:{rpc:async()=>({data:true,error:null}),from:()=>table}}});
 expect(result.rows).toHaveLength(1);
});
it('keeps all 3093 saved Simpla addresses during an outage and never overwrites the snapshot',async()=>{
 vi.stubEnv('SIMPLA_API_TOKEN','test');const fetch=vi.fn().mockRejectedValue(new Error('connection'));vi.stubGlobal('fetch',fetch);
 const {getSimplaMapLocations}=await import('./intervention-map.functions');
 const rows=Array.from({length:3093},(_,i)=>({ref:`s:${i}:f`,source:'simpla',key:`adres ${i}`,address:`Kerkstraat ${i}, 9000 Gent`,customer:'Klant',latest:'2026-11-12',bills:1}));
 const upsert=vi.fn();const table={select:()=>table,eq:()=>table,maybeSingle:async()=>({data:{rows,fetched_at:'2026-01-01T00:00:00Z'},error:null}),upsert,order:()=>table,range:async()=>({data:[],error:null}),in:async()=>({data:[],error:null})};
 const run=getSimplaMapLocations as unknown as (args:unknown)=>Promise<{rows:unknown[];error:string}>;
 const result=await run({data:{refresh:true},context:{userId:'admin',supabase:{rpc:async()=>({data:true,error:null}),from:()=>table}}});
 expect(result.rows).toHaveLength(3093);expect(result.error).toContain('laatst opgeslagen');expect(upsert).not.toHaveBeenCalled();
});
