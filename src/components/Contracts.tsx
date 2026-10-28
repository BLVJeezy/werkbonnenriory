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
import { REPEAT_PRESETS, repeatLabel, nthWeekdayOfMonth, addInterval, WEEKDAYS, ORDINALS, type RepeatUnit } from "@/lib/recurrence";
import { ContractBilling } from './ContractBilling';

type Opts = { techs: { id: string; name: string }[]; acts: { id: string; name: string }[] } | undefined;
const sel = "h-10 w-full rounded-md border bg-background px-2";
const empty = { customer: "", name: "", description: "", technician_id: "", activity_id: "", every: "1", unit: "maand" as RepeatUnit, next_date: "", end_date: "", mode: "datum" as "datum" | "weekdag", ordinal: "1", weekday: "0" };

export function Contracts({ opts }: { opts: Opts }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const planned = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  function openForm() { setOpen(true); setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
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
    const useOrdinal = f.mode === "weekdag" && f.unit !== "week";
    const ordinal = useOrdinal ? Number(f.ordinal) : null;
    const weekday = useOrdinal ? Number(f.weekday) : null;
    let nextDate = f.next_date;
    if (useOrdinal) {
      const [y, m] = f.next_date.split("-").map(Number) as [number, number];
      let cand = nthWeekdayOfMonth(y, m, ordinal!, weekday!);
      let guard = 0;
      while (cand < f.next_date && guard++ < 500) cand = addInterval(cand, Number(f.every), f.unit, ordinal, weekday);
      nextDate = cand;
    }
    const values = {
      customer_id: c.id, customer_name: c.name, name: f.name || c.name, description: f.description || null,
      technician_id: f.technician_id || null, activity_id: f.activity_id || null,
      repeat_every: Number(f.every), repeat_unit: f.unit, next_date: nextDate, end_date: f.end_date || null,
      repeat_ordinal: ordinal, repeat_weekday: weekday,
      scheduling_ready: true,
    };
    const { error } = editingId
      ? await supabase.from("contracts").update(values).eq("id", editingId)
      : await supabase.from("contracts").insert(values);
    if (error) { toast.error(error.message); return; }
    setF(empty); setOpen(false); setEditingId(null);
    await plan();
  }
  async function stop(id: string) {
    if (!confirm("Contract stopzetten? Reeds ingeplande taken blijven staan.")) return;
    await supabase.from("contracts").update({ active: false }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["contracts"] });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-black uppercase">Terugkerende opdrachten (contracten)</h2>
        <Button size="sm" variant="outline" onClick={() => plan()}>Nu inplannen</Button>
        <Button size="sm" onClick={() => { if (open) { setOpen(false); return; } setEditingId(null); setF(empty); openForm(); }}>{open ? "Sluiten" : "+ Terugkerende opdracht"}</Button>
      </div>
      <p className="text-sm text-muted-foreground">Contractbeurten · {PLAN_AHEAD_DAYS / 7} weken vooruit gepland · Werkbonnen enkel ter info</p>
      {open && (
        <form ref={formRef} onSubmit={save} className="grid scroll-mt-4 gap-3 rounded border-2 border-primary bg-background p-4 sm:grid-cols-2">
          <h3 className="font-black uppercase sm:col-span-2">{editingId ? `Planning instellen: ${f.name || "contract"}` : "Nieuwe terugkerende opdracht"}</h3>
          <div className="grid gap-1 sm:col-span-2"><Label htmlFor="ct-klant">Klant</Label>
            <Input id="ct-klant" required list="ct-klanten" placeholder="Typ om te zoeken…" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} />
            <datalist id="ct-klanten">{customers.map((c) => <option key={c.id} value={label(c)} />)}</datalist></div>
          <div className="grid gap-1"><Label htmlFor="ct-naam">Naam opdracht</Label><Input id="ct-naam" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="bv. Onderhoud dakgoten" /></div>
          <div className="grid gap-1"><Label htmlFor="ct-freq">Frequentie</Label>
            <select id="ct-freq" className={sel} value={`${f.every}-${f.unit}`} onChange={(e) => { const [ev, u] = e.target.value.split("-"); if (ev && u) setF({ ...f, every: ev, unit: u as RepeatUnit }); }}>
              {REPEAT_PRESETS.map((p) => <option key={p.label} value={`${p.every}-${p.unit}`}>{p.label}</option>)}
              {!REPEAT_PRESETS.some((p) => String(p.every) === f.every && p.unit === f.unit) && <option value={`${f.every}-${f.unit}`}>{repeatLabel(Number(f.every), f.unit)}</option>}
            </select></div>
          <div className="grid grid-cols-[5rem_1fr] gap-2 sm:col-span-2">
            <div className="grid gap-1"><Label htmlFor="ct-om">Om de</Label><Input id="ct-om" type="number" min={1} value={f.every} onChange={(e) => setF({ ...f, every: e.target.value || "1" })} /></div>
            <div className="grid gap-1"><Label htmlFor="ct-unit">Eenheid</Label><select id="ct-unit" className={sel} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as RepeatUnit })}><option value="week">weken</option><option value="maand">maanden</option><option value="jaar">jaar</option></select></div>
          </div>
          {f.unit !== "week" && (
            <div className="grid gap-2 sm:col-span-2">
              <Label>Plannen op</Label>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="radio" name="ct-mode" checked={f.mode === "datum"} onChange={() => setF({ ...f, mode: "datum" })} /> Vaste datum</label>
                <label className="flex items-center gap-1"><input type="radio" name="ct-mode" checked={f.mode === "weekdag"} onChange={() => setF({ ...f, mode: "weekdag" })} /> Bepaalde weekdag</label>
                {f.mode === "weekdag" && (
                  <span className="flex items-center gap-1">
                    <select aria-label="Welke" className={sel + " !w-auto"} value={f.ordinal} onChange={(e) => setF({ ...f, ordinal: e.target.value })}>
                      {ORDINALS.map((o, i) => <option key={o} value={String(i + 1)}>{o}</option>)}
                    </select>
                    <select aria-label="Weekdag" className={sel + " !w-auto"} value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>
                      {WEEKDAYS.map((w, i) => <option key={w} value={String(i)}>{w}</option>)}
                    </select>
                    <span className="text-muted-foreground">van de {f.unit === "jaar" ? "maand van de eerste beurt" : "maand"}</span>
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-1"><Label htmlFor="ct-start">Eerste beurt</Label><Input id="ct-start" type="date" required value={f.next_date} onChange={(e) => setF({ ...f, next_date: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="ct-eind">Einde contract (optioneel)</Label><Input id="ct-eind" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="ct-ploeg">Ploeg</Label><select id="ct-ploeg" className={sel} value={f.technician_id} onChange={(e) => setF({ ...f, technician_id: e.target.value })}><option value="">— Later —</option>{opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="grid gap-1"><Label htmlFor="ct-act">Activiteit</Label><select id="ct-act" className={sel} value={f.activity_id} onChange={(e) => setF({ ...f, activity_id: e.target.value })}><option value="">— Kies —</option>{opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="grid gap-1 sm:col-span-2"><Label htmlFor="ct-oms">Omschrijving voor de ploeg</Label><Textarea id="ct-oms" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <Button type="submit" className="sm:col-span-2">Opslaan en inplannen</Button>
        </form>
      )}
      {contracts.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen terugkerende opdrachten.</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contracts.map((c) => (
            <div key={c.id} className={`rounded border bg-background p-2 text-sm ${c.active ? "" : "opacity-50"}`}>
              <div className="font-bold">{c.number ? `${c.number} · ` : ""}{c.name}</div>
              <div>{c.customer_name}</div>
              <div className="text-xs text-muted-foreground">{c.active ? (c.scheduling_ready ? `${repeatLabel(c.repeat_every, c.repeat_unit as RepeatUnit, c.repeat_ordinal, c.repeat_weekday)} · volgende ${c.next_date.split("-").reverse().join("-")}` : "Gestart · planning nog in te stellen") : "gestopt"} · {c.technicians?.name ?? "geen ploeg"}</div>
              {c.source_data && <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium">Contractgegevens</summary>
                <p className="mt-1 whitespace-pre-wrap text-xs">{c.description}</p>
                {Array.isArray(c.source_data) && c.source_data.map((line, i) => {
                  if (!line || typeof line !== "object" || Array.isArray(line)) return null;
                  return <div key={i} className="mt-2 border-t pt-2 text-xs">
                    <div>{String(line["verkoop"] ?? "")}</div>
                    <div>{String(line["aantal"] ?? "")} {String(line["eenheid"] ?? "")} · € {Number(line["eenheidsprijs"] ?? 0).toLocaleString("nl-BE", { minimumFractionDigits: 2 })} · korting {String(line["kortingspercentage"] ?? 0)}% · btw {String(line["BTW-percentage"] ?? 0)}%</div>
                  </div>;
                })}
              </details>}
              {c.active && <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
                const list = await allCustomers(supabase);
                const customer = list.find((x) => x.id === c.customer_id);
                if (!customer) { toast.error("Klant niet gevonden"); return; }
                setEditingId(c.id);
                setF({ ...empty, customer: label(customer), name: c.name, description: c.description ?? "", every: String(c.repeat_every), unit: c.repeat_unit as RepeatUnit, next_date:c.scheduling_ready?c.next_date:'',end_date:c.end_date??'',technician_id:c.technician_id??'',activity_id:c.activity_id??'', mode: c.repeat_ordinal ? "weekdag" : "datum", ordinal: String(c.repeat_ordinal ?? 1), weekday: String(c.repeat_weekday ?? 0) });
                openForm();
              }}>{c.scheduling_ready?'Contract bewerken':'Planning instellen'}</Button>}
              <ContractBilling contract={c}/>
              {c.active && <Button size="sm" variant="outline" className="mt-1 h-7 text-destructive" onClick={() => stop(c.id)}>Stopzetten</Button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
