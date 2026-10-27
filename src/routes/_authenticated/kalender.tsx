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

export const Route = createFileRoute("/_authenticated/kalender")({
  head: () => ({ meta: [{ title: "Kalender — Riory" }] }),
  component: Kalender,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function monday(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

type Row = { id: string; number: number; customer_name: string; city: string | null; use_site_address: boolean; site_city: string | null; scheduled_date: string | null; status: string; technician_id: string | null; activity_id: string | null; vat_rate: number; sort_order: number; technicians: { name: string; color: string | null } | null };

function Kalender() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [start, setStart] = useState(() => monday(new Date()));
  const [drag, setDrag] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["work_orders", "calendar"],
    queryFn: async () =>
      ((await supabase.from("work_orders").select("id, number, customer_name, city, use_site_address, site_city, scheduled_date, status, technician_id, activity_id, vat_rate, sort_order, technicians(name, color)").neq("status", "afgetekend").order("sort_order").order("number")).data ?? []) as Row[],
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
    [next[i], next[j]] = [next[j]!, next[i]!];
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
  const card = (w: Row, i?: number, list?: Row[]) => (
    <div key={w.id} draggable onDragStart={() => setDrag(w.id)} style={crewStyle(w.technicians?.color)} className="cursor-grab rounded border bg-background p-2 text-sm">
      <div className="flex items-start gap-1">
        <Link to="/werkbonnen/$id" params={{ id: w.id }} className="flex-1 font-bold underline">#{w.number} {w.customer_name}</Link>
        <button type="button" title="Verwijderen" className="px-1 font-bold" onClick={() => deleteTask(qc, w.id, `Taak #${w.number} (${w.customer_name})`)}>✕</button>
      </div>
      <div className="flex items-center gap-1 text-xs opacity-80">
        {list && <span className="font-mono font-bold">{i! + 1}.</span>}
        <span className="flex-1">{(w.use_site_address ? w.site_city : w.city) ?? ""}</span>
        {list && (
          <>
            <button type="button" title="Eerder" disabled={i === 0} className="px-1 disabled:opacity-30" onClick={() => move(list, i!, -1)}>▲</button>
            <button type="button" title="Later" disabled={i === list.length - 1} className="px-1 disabled:opacity-30" onClick={() => move(list, i!, 1)}>▼</button>
          </>
        )}
      </div>
      <Input type="date" className="mt-1 h-7 bg-background text-xs text-foreground" value={w.scheduled_date ?? ""} onChange={(e) => plan(w.id, e.target.value || null)} />
      <select className={sel} value={w.technician_id ?? ""} onChange={(e) => set(w.id, { technician_id: e.target.value || null, status: e.target.value ? "toegewezen" : "nieuw" })}>
        <option value="">— Ploeg —</option>
        {opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select className={sel} value={w.activity_id ?? ""} onChange={(e) => set(w.id, { activity_id: e.target.value || null })}>
        <option value="">— Activiteit —</option>
        {opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className={sel} value={String(Number(w.vat_rate))} onChange={(e) => set(w.id, { vat_rate: Number(e.target.value) })}>
        {VAT_RATES.map((r) => <option key={r} value={r}>Btw {r}%</option>)}
      </select>
    </div>
  );
  const unplanned = data.filter((w) => !w.scheduled_date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-3xl font-black uppercase">Kalender</h1>
        <Button variant="outline" size="sm" onClick={() => shift(-7)}>← Vorige week</Button>
        <Button variant="outline" size="sm" onClick={() => setStart(monday(new Date()))}>Deze week</Button>
        <Button variant="outline" size="sm" onClick={() => shift(7)}>Volgende week →</Button>
      </div>
      <p className="text-sm text-muted-foreground">Sleep een taak naar een dag, of kies een datum. Klik op + om op die dag een nieuwe taak aan te maken.</p>
      <div className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const k = iso(d);
          return (
            <div key={k} {...drop(k)} className={`min-h-40 space-y-2 rounded-md border bg-card p-2 ${k === today ? "border-2 border-primary" : ""}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-black uppercase">
                  {d.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2" title="Taak aanmaken op deze dag" onClick={() => navigate({ to: "/werkbonnen", search: { dag: k } })}>+</Button>
              </div>
              {dayList(k).map((w, i, l) => card(w, i, l))}
            </div>
          );
        })}
      </div>
      <section {...drop(null)} className="rounded-md border bg-card p-3">
        <h2 className="mb-2 text-lg font-black uppercase">Nog in te plannen ({unplanned.length})</h2>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">{unplanned.map((w) => card(w))}</div>
      </section>
    </div>
  );
}
