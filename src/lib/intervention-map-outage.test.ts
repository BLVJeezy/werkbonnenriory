import { expect,it,vi } from 'vitest';
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,handler:(fn:unknown)=>fn,inputValidator:()=>b};return b}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
it('retains project addresses when Simpla connection fails',async()=>{
 vi.stubEnv('SIMPLA_API_TOKEN','test');vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('connection')));
 const {getSimplaMapLocations}=await import('/dev-server/src/lib/intervention-map.functions');
 const table={select:()=>table,order:()=>table,range:async()=>({data:[{id:'project',name:'Project',street:'Kerkstraat',house_number:'12',postal_code:'9000',city:'Gent',created_at:'2026-11-12'}],error:null}),in:async()=>({data:[],error:null})};
 const run=getSimplaMapLocations as unknown as (args:unknown)=>Promise<{rows:unknown[]}>;
 const result=await run({context:{userId:'admin',supabase:{rpc:async()=>({data:true,error:null}),from:()=>table}}});
 expect(result.rows).toHaveLength(1);
});
