import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTechnicianLogin, deleteTechnician } from "@/lib/technicians.functions";
import { createExternalCrew } from '@/lib/appointments.functions';

export const Route = createFileRoute("/_authenticated/technici")({
  head: () => ({ meta: [{ title: "Ploegen — Riory Werkbonnen" }, { name: "description", content: "Beheer Riory-ploegen, hun toegang en persoonlijke weergave." }, { property: "og:title", content: "Ploegen — Riory Werkbonnen" }, { property: "og:description", content: "Beheer Riory-ploegen, hun toegang en persoonlijke weergave." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Technici,
});

const empty = { name: "", phone: "", password: "" };

function Technici() {
  const qc = useQueryClient();
  const create = useServerFn(createTechnicianLogin);
  const createExternal=useServerFn(createExternalCrew);
  const [external,setExternal]=useState({name:'',email:''});
  const remove = useServerFn(deleteTechnician);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => (await supabase.from("technicians").select("*").order("name")).data ?? [],
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: f });
      toast.success(`Login aangemaakt voor ploeg ${f.name}`);
      setF(empty);
      qc.invalidateQueries({ queryKey: ["technicians"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black uppercase">Ploegen</h1>
      <form className="grid gap-3 border-b pb-5 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await createExternal({data:external});setExternal({name:'',email:''});qc.invalidateQueries({queryKey:['technicians']});toast.success('Externe ploeg toegevoegd zonder login');}catch(e){toast.error(e instanceof Error?e.message:'Aanmaken mislukt');}finally{setBusy(false);}}}><Input aria-label="Naam externe ploeg" placeholder="Naam externe ploeg" required value={external.name} onChange={e=>setExternal({...external,name:e.target.value})}/><Input aria-label="E-mailadres externe ploeg" type="email" placeholder="E-mailadres externe ploeg" required value={external.email} onChange={e=>setExternal({...external,email:e.target.value})}/><Button disabled={busy}>Externe ploeg toevoegen</Button></form>
      <form onSubmit={add} className="grid gap-2 rounded-md border bg-card p-4 sm:grid-cols-2">
        <Input placeholder="Naam ploeg (= loginnaam)" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="Telefoon" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="Wachtwoord (min. 6 tekens)" type="text" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Button disabled={busy} className="sm:col-span-2">
          {busy ? "Aanmaken…" : "Ploeg + login aanmaken"}
        </Button>
      </form>
      <ul className="divide-y rounded-md border bg-card">
        {data.length === 0 && <li className="p-4 text-muted-foreground">Nog geen ploegen.</li>}
        {data.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2 font-bold">
                <input
                  type="color"
                  title="Kleur van deze ploeg"
                  className="h-8 w-10 cursor-pointer rounded border"
                  defaultValue={t.color ?? "#f97316"}
                  onChange={async (e) => {
                    await supabase.from("technicians").update({ color: e.target.value }).eq("id", t.id);
                    qc.invalidateQueries({ queryKey: ["technicians"] });
                    qc.invalidateQueries({ queryKey: ["work_orders"] });
                  }}
                />
                {t.name}
              </div>
              <div className="text-sm text-muted-foreground">
                {[t.external_planning ? `Externe ploeg · ${t.email} · geen systeemtoegang` : t.user_id ? `login: ${t.name}` : "geen login", t.phone].filter(Boolean).join(" · ")}
              </div>
              <form
                className="mt-2 flex flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const patch: { name?: string; phone: string | null; email?: string | null } = { phone: String(fd.get("phone") ?? "").trim() || null };
                  if (!t.user_id) patch.name = String(fd.get("name") ?? "").trim() || t.name;
                  if (t.external_planning) patch.email = String(fd.get("email") ?? "").trim() || t.email;
                  const { error } = await supabase.from("technicians").update(patch).eq("id", t.id);
                  if (error) toast.error("Opslaan mislukt");
                  else { toast.success("Ploeggegevens opgeslagen"); qc.invalidateQueries({ queryKey: ["technicians"] }); qc.invalidateQueries({ queryKey: ["work_orders"] }); }
                }}
              >
                <Input name="name" aria-label="Naam ploeg" className="h-8 w-40" defaultValue={t.name} disabled={!!t.user_id} title={t.user_id ? "Naam is de loginnaam en kan niet gewijzigd worden" : undefined} />
                <Input name="phone" aria-label="Telefoon ploeg" placeholder="Telefoon" className="h-8 w-36" defaultValue={t.phone ?? ""} />
                {t.external_planning && <Input name="email" type="email" required aria-label="E-mailadres ploeg" className="h-8 w-56" defaultValue={t.email ?? ""} />}
                <Button size="sm" variant="outline" type="submit">Opslaan</Button>
              </form>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {(
                  [
                    ["show_prices", "Prijzen en totaal"],
                    ["show_contact", "Klantgegevens"],
                    ["can_payment", "Afrekenen"],
                    ["show_signed", "Afgetekende werkbonnen"],
                    ["large_text", "Extra grote letters"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={t[k]}
                      disabled={t.external_planning && (k==='show_prices' || k==='can_payment')}
                      onChange={async (e) => {
                        await supabase.from("technicians").update({ [k]: e.target.checked } as { show_prices: boolean }).eq("id", t.id);
                        qc.invalidateQueries({ queryKey: ["technicians"] });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm(`${t.name} en de login verwijderen?`)) return;
                try {
                  await remove({ data: { id: t.id } });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Mislukt");
                }
                qc.invalidateQueries({ queryKey: ["technicians"] });
              }}
            >
              Verwijderen
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
