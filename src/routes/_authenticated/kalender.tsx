import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTask } from "@/lib/delete-task";
import { VAT_RATES } from "@/lib/billing";
import { crewStyle } from "@/lib/crew-color";
import type { Database } from "@/integrations/supabase/types";
import { RunningTask } from "@/components/RunningTask";
import type { TimeEntry } from "@/lib/time";
import { activeTimeEntry } from "@/lib/time";
import { isUrgentOpen, URGENT_RING } from "@/lib/urgent";
import { taskListRows } from "@/lib/task-list";
import { destinationLabel, destinationLines } from "@/lib/address";
import { AppointmentMailSync } from "@/components/AppointmentMailSync";
import { X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kalender")({
  head: () => ({ meta: [{ title: "Kalender — Riory" }, { name: "description", content: "Plan Riory-taken per dag en wijs ploegen en activiteiten toe." }, { property: "og:title", content: "Kalender — Riory" }, { property: "og:description", content: "Plan Riory-taken per dag en wijs ploegen en activiteiten toe." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Kalender,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function monday(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

type Row = Database["public"]["Tables"]["work_orders"]["Row"] & { technicians: { name: string; color: string | null } | null; time_entries: TimeEntry[] };

function Kalender() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [start, setStart] = useState(() => monday(new Date()));
  const [drag, setDrag] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["work_orders", "calendar"],
    refetchInterval: 10000,
    queryFn: async () =>
      taskListRows((await supabase.from("work_orders").select("*, technicians(name, color), time_entries(started_at, ended_at)").neq("status", "offerte").eq("quote_pending", false).order("sort_order").order("number")).data ?? []) as Row[],
  });
  const { data: opts } = useQuery({
    queryKey: ["assign_opts"],
    queryFn: async () => {
      const [t, a] = await Promise.all([
        supabase.from("technicians").select("id, name").order("name"),
        supabase.from("activities").select("id, name, hourly_rate").order("name"),
      ]);
      return { techs: t.data ?? [], acts: a.data ?? [] };
    },
  });
  async function set(id: string, patch: Database["public"]["Tables"]["work_orders"]["Update"]) {
    const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  const sel = "mt-1 h-7 w-full rounded border bg-background px-1 text-xs text-foreground";
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = iso(new Date());

  const dayList = (k: string) => data.filter((w) => w.scheduled_date === k);
  async function move(list: Row[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    const current = next[i]; const other = next[j];
    if (!current || !other) return;
    [next[i], next[j]] = [other, current];
    await Promise.all(next.map((w, n) => supabase.from("work_orders").update({ sort_order: n + 1 }).eq("id", w.id)));
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  async function plan(id: string, date: string | null) {
    if (date) {
      const end = Math.max(0, ...dayList(date).filter((w) => w.id !== id).map((w) => w.sort_order)) + 1;
      const { error } = await supabase.from("work_orders").update({ scheduled_date: date, sort_order: end }).eq("id", id);
      if (error) toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["work_orders"] });
      return;
    }
    const { error } = await supabase.from("work_orders").update({ scheduled_date: date }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  const shift = (n: number) => setStart((s) => { const d = new Date(s); d.setDate(d.getDate() + n); return d; });
  const drop = (date: string | null) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: () => { if (drag) plan(drag, date); setDrag(null); },
  });
  const card = (w: Row, i?: number, list?: Row[], horizontal = false) => w.status === "afgetekend" ? (
    <div key={w.id} style={crewStyle(w.technicians?.color)} className="rounded border bg-background px-2 py-1 text-xs opacity-75">
      <div className="flex items-center gap-1">
        <span className="rounded bg-foreground px-1 font-bold text-background">Afgewerkt</span>
        <Link to="/werkbonnen/$id" params={{ id: w.id }} className="min-w-0 flex-1 truncate font-bold underline">#{w.number} {w.customer_name}</Link>
      </div>
      <p className="truncate opacity-80">{[w.scheduled_from && `${w.scheduled_from.slice(0,5)}–${w.scheduled_until?.slice(0,5) ?? ""}`, w.use_site_address ? w.site_city : w.city, w.technicians?.name].filter(Boolean).join(" · ")}</p>
    </div>
  ) : (
    <div key={w.id} draggable onPointerDown={(e) => { e.currentTarget.draggable = !(e.target as HTMLElement).closest("input,select,button,a,textarea"); }} onDragStart={() => setDrag(w.id)} style={crewStyle(w.technicians?.color)} className={`cursor-grab rounded border bg-background p-3 text-sm ${horizontal ? "grid gap-x-5 gap-y-2 lg:grid-cols-[minmax(0,1fr)_20rem]" : ""} ${isUrgentOpen(w) ? URGENT_RING : ""} ${activeTimeEntry(w.time_entries) ? "task-running" : ""}`}>
      <div className="min-w-0">
      {(isUrgentOpen(w) || w.contract_id) && <div className="mb-1 flex gap-1 text-xs font-bold">{isUrgentOpen(w) && <span className="animate-pulse rounded bg-destructive px-1 text-destructive-foreground">DRINGEND</span>}{w.contract_id && <span className="rounded bg-secondary px-1 text-secondary-foreground">Contract</span>}</div>}
      <div className="flex items-start gap-1">
        <Link to="/werkbonnen/$id" params={{ id: w.id }} className="flex-1 font-bold underline">#{w.number} {w.customer_name}{w.project_name ? ` · ${w.project_name}` : ""}</Link>
        <Button type="button" size="icon" variant="ghost" title="Verwijderen" aria-label="Taak verwijderen" className="h-7 w-7 shrink-0" onClick={() => deleteTask(qc, w.id, `Taak #${w.number} (${w.customer_name})`)}><X /></Button>
      </div>
      <RunningTask entries={w.time_entries} crewName={w.technicians?.name} />
      {w.scheduled_from && <p className="font-bold">{w.scheduled_from.slice(0,5)}–{w.scheduled_until?.slice(0,5)}</p>}
      <div className="flex items-center gap-1 text-xs opacity-80">
        {list && i !== undefined && <span className="font-mono font-bold">{i + 1}.</span>}
        <span className="flex-1">{(w.use_site_address ? w.site_city : w.city) ?? ""}</span>
        {list && i !== undefined && (
          <>
            <Button type="button" variant="ghost" size="icon" title="Eerder" disabled={i === 0} className="h-6 w-6" onClick={() => move(list, i, -1)}>▲</Button>
            <Button type="button" variant="ghost" size="icon" title="Later" disabled={i === list.length - 1} className="h-6 w-6" onClick={() => move(list, i, 1)}>▼</Button>
          </>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-snug">{w.description || "Geen omschrijving"}</p>
      {horizontal && <>
        <p className="mt-2 font-medium">{destinationLabel(w)}: {destinationLines(w).join(" · ") || "Niet ingevuld"}</p>
        {(w.site_contact_name || w.phone || w.site_contact_phone) && <p className="mt-2 text-xs opacity-80">{[w.site_contact_name, w.site_contact_phone, w.phone && `Klant: ${w.phone}`].filter(Boolean).join(" · ")}</p>}
      </>}
      </div>
      <div className={horizontal ? "grid content-start gap-2 sm:grid-cols-2" : "grid grid-cols-2 gap-1.5 sm:grid-cols-4"}>
      <Input key={w.scheduled_date ?? "none"} type="date" aria-label={`Dag taak ${w.number}`} className="mt-0 h-7 bg-background text-xs text-foreground" defaultValue={w.scheduled_date ?? ""} onBlur={(e) => { const v = e.target.value || null; if (v !== (w.scheduled_date ?? null)) plan(w.id, v); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <select aria-label={`Ploeg taak ${w.number}`} className={sel} value={w.technician_id ?? ""} onChange={(e) => set(w.id, { technician_id: e.target.value || null, status: e.target.value ? "toegewezen" : "nieuw" })}>
        <option value="">— Ploeg —</option>
        {opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select aria-label={`Activiteit taak ${w.number}`} className={sel} value={w.activity_id ?? ""} onChange={(e) => set(w.id, { activity_id: e.target.value || null })}>
        <option value="">— Activiteit —</option>
        {opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className={sel} value={String(Number(w.vat_rate))} onChange={(e) => set(w.id, { vat_rate: Number(e.target.value) })}>
        {VAT_RATES.map((r) => <option key={r} value={r}>Btw {r}%</option>)}
      </select>
      </div>
    </div>
  );
  const unplanned = data.filter((w) => !w.scheduled_date && w.status !== "afgetekend");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-3xl font-black uppercase">Kalender</h1>
        <Button variant="outline" size="sm" onClick={() => shift(-7)}>← Vorige week</Button>
        <Button variant="outline" size="sm" onClick={() => setStart(monday(new Date()))}>Deze week</Button>
        <Button variant="outline" size="sm" onClick={() => shift(7)}>Volgende week →</Button>
      </div>
      <p className="text-sm text-muted-foreground">Sleep een taak naar een dag, of kies een datum. Klik op + om op die dag een nieuwe taak aan te maken.</p>
      <AppointmentMailSync />
      <div className="grid gap-3 xl:grid-cols-7 xl:gap-2">
        {days.map((d) => {
          const k = iso(d);
          return (
            <div key={k} {...drop(k)} className={`space-y-2 rounded-md border bg-card p-2 xl:min-h-40 ${k === today ? "border-2 border-primary" : ""}`}>
              <div className="-mx-2 -mt-2 flex items-center justify-between gap-1 rounded-t-md border-b bg-muted px-2 py-1.5 xl:mx-0 xl:mt-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0">
                <span className="text-base font-black uppercase xl:text-sm">
                  {d.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2" title="Taak aanmaken op deze dag" onClick={() => navigate({ to: "/werkbonnen", search: { dag: k } })}>+</Button>
              </div>
              <div className="grid gap-2">
                {dayList(k).filter((w) => w.status !== "afgetekend").map((w, i, l) => card(w, i, l))}
                {dayList(k).filter((w) => w.status === "afgetekend").map((w) => card(w))}
                {dayList(k).length === 0 && <p className="text-xs text-muted-foreground">Geen taken</p>}
              </div>
            </div>
          );
        })}
      </div>
      <section {...drop(null)} className="rounded-md border bg-card p-3">
        <h2 className="mb-2 text-lg font-black uppercase">Nog in te plannen ({unplanned.length})</h2>
        <div className="grid gap-2">{unplanned.map((w) => card(w, undefined, undefined, true))}</div>
      </section>
      <Button variant="outline" asChild><Link to="/contracten">Contracten beheren</Link></Button>
    </div>
  );
}
