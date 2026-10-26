import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTask } from "@/lib/delete-task";

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

type Row = { id: string; number: number; customer_name: string; city: string | null; scheduled_date: string | null; status: string; technicians: { name: string } | null };

function Kalender() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [start, setStart] = useState(() => monday(new Date()));
  const [drag, setDrag] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["work_orders", "calendar"],
    queryFn: async () =>
      ((await supabase.from("work_orders").select("id, number, customer_name, city, scheduled_date, status, technicians(name)").neq("status", "afgetekend").order("number")).data ?? []) as Row[],
  });
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = iso(new Date());

  async function plan(id: string, date: string | null) {
    const { error } = await supabase.from("work_orders").update({ scheduled_date: date }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  const shift = (n: number) => setStart((s) => { const d = new Date(s); d.setDate(d.getDate() + n); return d; });
  const drop = (date: string | null) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: () => { if (drag) plan(drag, date); setDrag(null); },
  });
  const card = (w: Row) => (
    <div key={w.id} draggable onDragStart={() => setDrag(w.id)} className="cursor-grab rounded border bg-background p-2 text-sm">
      <div className="flex items-start gap-1">
        <Link to="/werkbonnen/$id" params={{ id: w.id }} className="flex-1 font-bold underline">#{w.number} {w.customer_name}</Link>
        <button type="button" title="Verwijderen" className="px-1 text-destructive" onClick={() => deleteTask(qc, w.id, `Taak #${w.number} (${w.customer_name})`)}>✕</button>
      </div>
      <div className="text-xs text-muted-foreground">{w.city ?? ""}{w.technicians ? ` · ${w.technicians.name}` : " · geen ploeg"}</div>
      <Input type="date" className="mt-1 h-7 text-xs" value={w.scheduled_date ?? ""} onChange={(e) => plan(w.id, e.target.value || null)} />
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
              {data.filter((w) => w.scheduled_date === k).map(card)}
            </div>
          );
        })}
      </div>
      <section {...drop(null)} className="rounded-md border bg-card p-3">
        <h2 className="mb-2 text-lg font-black uppercase">Nog in te plannen ({unplanned.length})</h2>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">{unplanned.map(card)}</div>
      </section>
    </div>
  );
}
