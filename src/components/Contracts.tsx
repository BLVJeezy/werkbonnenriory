import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { allCustomers } from "@/lib/customers";
import { planContracts, PLAN_AHEAD_DAYS } from "@/lib/contracts";
import { REPEAT_PRESETS, repeatLabel, type RepeatUnit } from "@/lib/recurrence";

type Opts = { techs: { id: string; name: string }[]; acts: { id: string; name: string }[] } | undefined;
const sel = "h-10 w-full rounded-md border bg-background px-2";
const empty = { customer: "", name: "", description: "", technician_id: "", activity_id: "", every: "1", unit: "maand" as RepeatUnit, next_date: "", end_date: "" };

export function Contracts({ opts }: { opts: Opts }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const planned = useRef(false);
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => (await supabase.from("contracts").select("*, technicians(name)").order("name")).data ?? [],
  });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], enabled: open, queryFn: () => allCustomers(supabase) });
  const label = (c: (typeof customers)[number]) => [c.customer_number, c.name, c.city].filter(Boolean).join(" — ");

  async function plan(quiet = false) {
    try {
      const n = await planContracts(supabase);
      if (n || !quiet) toast.success(n ? `${n} contracttaken in de agenda gezet` : "Alles is al ingepland");
      qc.invalidateQueries({ queryKey: ["work_orders"] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Inplannen mislukt"); }
  }
  useEffect(() => { if (!planned.current) { planned.current = true; void plan(true); } return undefined; }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const c = customers.find((x) => label(x) === f.customer);
    if (!c) { toast.error("Kies een bestaande klant uit de lijst"); return; }
    const { error } = await supabase.from("contracts").insert({
      customer_id: c.id, customer_name: c.name, name: f.name || c.name, description: f.description || null,
      technician_id: f.technician_id || null, activity_id: f.activity_id || null,
      repeat_every: Number(f.every), repeat_unit: f.unit, next_date: f.next_date, end_date: f.end_date || null,
    });
    if (error) { toast.error(error.message); return; }
    setF(empty); setOpen(false);
    await plan();
  }
  async function stop(id: string) {
    if (!confirm("Contract stopzetten? Reeds ingeplande taken blijven staan.")) return;
    await supabase.from("contracts").update({ active: false }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["contracts"] });
  }

  return (
    <section className="space-y-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-black uppercase">Terugkerende opdrachten (contracten)</h2>
        <Button size="sm" variant="outline" onClick={() => plan()}>Nu inplannen</Button>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>{open ? "Sluiten" : "+ Terugkerende opdracht"}</Button>
      </div>
      <p className="text-sm text-muted-foreground">Beurten worden automatisch {PLAN_AHEAD_DAYS / 7} weken vooruit in de agenda gezet. Werkbonnen van een contract zijn enkel ter info en worden niet gefactureerd.</p>
      {open && (
        <form onSubmit={save} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <div className="grid gap-1 sm:col-span-2"><Label htmlFor="ct-klant">Klant</Label>
            <Input id="ct-klant" required list="ct-klanten" placeholder="Typ om te zoeken…" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} />
            <datalist id="ct-klanten">{customers.map((c) => <option key={c.id} value={label(c)} />)}</datalist></div>
          <div className="grid gap-1"><Label htmlFor="ct-naam">Naam opdracht</Label><Input id="ct-naam" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="bv. Onderhoud dakgoten" /></div>
          <div className="grid gap-1"><Label htmlFor="ct-freq">Frequentie</Label>
            <select id="ct-freq" className={sel} value={`${f.every}-${f.unit}`} onChange={(e) => { const [ev, u] = e.target.value.split("-"); setF({ ...f, every: ev!, unit: u as RepeatUnit }); }}>
              {REPEAT_PRESETS.map((p) => <option key={p.label} value={`${p.every}-${p.unit}`}>{p.label}</option>)}
              {!REPEAT_PRESETS.some((p) => String(p.every) === f.every && p.unit === f.unit) && <option value={`${f.every}-${f.unit}`}>{repeatLabel(Number(f.every), f.unit)}</option>}
            </select></div>
          <div className="grid grid-cols-[5rem_1fr] gap-2 sm:col-span-2">
            <div className="grid gap-1"><Label htmlFor="ct-om">Om de</Label><Input id="ct-om" type="number" min={1} value={f.every} onChange={(e) => setF({ ...f, every: e.target.value || "1" })} /></div>
            <div className="grid gap-1"><Label htmlFor="ct-unit">Eenheid</Label><select id="ct-unit" className={sel} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as RepeatUnit })}><option value="week">weken</option><option value="maand">maanden</option><option value="jaar">jaar</option></select></div>
          </div>
          <div className="grid gap-1"><Label htmlFor="ct-start">Eerste beurt</Label><Input id="ct-start" type="date" required value={f.next_date} onChange={(e) => setF({ ...f, next_date: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="ct-eind">Einde contract (optioneel)</Label><Input id="ct-eind" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="ct-ploeg">Ploeg</Label><select id="ct-ploeg" className={sel} value={f.technician_id} onChange={(e) => setF({ ...f, technician_id: e.target.value })}><option value="">— Later —</option>{opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="grid gap-1"><Label htmlFor="ct-act">Activiteit</Label><select id="ct-act" className={sel} value={f.activity_id} onChange={(e) => setF({ ...f, activity_id: e.target.value })}><option value="">— Kies —</option>{opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="grid gap-1 sm:col-span-2"><Label htmlFor="ct-oms">Omschrijving voor de ploeg</Label><Textarea id="ct-oms" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <Button type="submit" className="sm:col-span-2">Opslaan en inplannen</Button>
        </form>
      )}
      {contracts.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen terugkerende opdrachten.</p> : (
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {contracts.map((c) => (
            <div key={c.id} className={`rounded border bg-background p-2 text-sm ${c.active ? "" : "opacity-50"}`}>
              <div className="font-bold">{c.name}</div>
              <div>{c.customer_name}</div>
              <div className="text-xs text-muted-foreground">{repeatLabel(c.repeat_every, c.repeat_unit as RepeatUnit)} · {c.technicians?.name ?? "geen ploeg"} · {c.active ? `volgende ${c.next_date.split("-").reverse().join("-")}` : "gestopt"}</div>
              {c.active && <Button size="sm" variant="outline" className="mt-1 h-7 text-destructive" onClick={() => stop(c.id)}>Stopzetten</Button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
