import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Contracts } from '@/components/Contracts';
import { useRole } from '@/lib/use-role';
export const Route=createFileRoute('/_authenticated/contracten')({head:()=>({meta:[{title:'Contracten — Riory Werkbonnen'},{name:'description',content:'Beheer Riory-contracten, terugkerende beurten en automatische facturatie.'},{property:'og:title',content:'Contracten — Riory Werkbonnen'},{property:'og:description',content:'Contractplanning en facturatie per uitgevoerde beurt.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:Contracten});
function Contracten(){
 const role=useRole();
 const {data:opts}=useQuery({queryKey:['assign_opts'],enabled:role==='admin',queryFn:async()=>{const [t,a]=await Promise.all([supabase.from('technicians').select('id,name').order('name'),supabase.from('activities').select('id,name').order('name')]);return {techs:t.data??[],acts:a.data??[]};}});
 if(role!=='admin')return <p>Alleen voor beheerder.</p>;
 return <div className="space-y-6"><h1 className="text-3xl font-black uppercase">Contracten</h1><Contracts opts={opts}/></div>;
}