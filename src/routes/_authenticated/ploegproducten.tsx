import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/use-role";

export const Route = createFileRoute("/_authenticated/ploegproducten")({
  head: () => ({ meta: [
    { title: "Producten per ploeg — Riory" },
    { name: "description", content: "Kies welke producten elke ploeg op werkbonnen mag zien en selecteren." },
    { property: "og:title", content: "Producten per ploeg — Riory" },
    { property: "og:description", content: "Kies welke producten elke ploeg op werkbonnen mag zien en selecteren." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const role = useRole();
  const qc = useQueryClient();
  const [tech, setTech] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const techs = useQuery({ queryKey: ["pa_techs"], queryFn: async () => (await supabase.from("technicians").select("id, name, product_scope").order("name")).data ?? [] });
  const techId = tech || techs.data?.[0]?.id || "";
  const t = techs.data?.find((x) => x.id === techId);
  const prods = useQuery({ queryKey: ["pa_prods"], queryFn: async () => (await supabase.from("products").select("id, name, alias, unit, admin_only").eq("admin_only", false).order("name")).data ?? [] });
  const access = useQuery({
    queryKey: ["pa_access", techId], enabled: !!techId,
    queryFn: async () => new Set(((await supabase.from("crew_product_access").select("product_id").eq("technician_id", techId)).data ?? []).map((r) => r.product_id)),
  });
  if (role !== "admin") return <p className="text-muted-foreground">Alleen voor beheerders.</p>;

  const refresh = () => { qc.invalidateQueries({ queryKey: ["pa_access", techId] }); qc.invalidateQueries({ queryKey: ["pa_techs"] }); };
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    if (busy) return; setBusy(true);
    const { error } = await fn(); setBusy(false);
    if (error) toast.error(error.message); refresh();
  }
  const setScope = (s: string) => run(() => supabase.from("technicians").update({ product_scope: s }).eq("id", techId));
  const toggle = (pid: string, on: boolean) => run(() => on
    ? supabase.from("crew_product_access").insert({ technician_id: techId, product_id: pid })
    : supabase.from("crew_product_access").delete().eq("technician_id", techId).eq("product_id", pid));
  const list = (prods.data ?? []).filter((p) => `${p.alias ?? ""} ${p.name}`.toLowerCase().includes(q.toLowerCase()));
  const sel = access.data ?? new Set<string>();
  const selectAll = (on: boolean) => run(() => on
    ? supabase.from("crew_product_access").upsert(list.map((p) => ({ technician_id: techId, product_id: p.id })), { ignoreDuplicates: true })
    : supabase.from("crew_product_access").delete().eq("technician_id", techId).in("product_id", list.map((p) => p.id)));
  const limited = t?.product_scope === "gekozen";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase">Producten per ploeg</h1>
      <p className="text-sm text-muted-foreground">Bepaal welke producten een ploeg op een werkbon mag zien en kiezen. Dit is geen voorraad: er worden geen aantallen bijgehouden of afgeboekt. Beheerders zien altijd alle producten; producten "enkel admin" zijn nooit zichtbaar voor ploegen.</p>
      <select className="h-10 w-full rounded-md border bg-background px-2 sm:w-72" value={techId} onChange={(e) => setTech(e.target.value)}>
        {(techs.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}{x.product_scope === "gekozen" ? " (gekozen producten)" : ""}</option>)}
      </select>
      {t && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={!limited} disabled={busy} onChange={() => setScope("alle")} /><span><b>Alle ploegproducten</b> — standaard voor een ploeg die nog niet ingesteld is (alle producten behalve "enkel admin").</span></label>
          <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={limited} disabled={busy} onChange={() => setScope("gekozen")} /><span><b>Enkel aangevinkte producten</b> — niets aangevinkt betekent: geen producten kiesbaar.</span></label>
        </div>
      )}
      {t && limited && (
        <section className="rounded-md border bg-card p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            <Input className="flex-1 min-w-48" placeholder="Zoek product…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button variant="outline" disabled={busy || !list.length} onClick={() => selectAll(true)}>Alles aanvinken</Button>
            <Button variant="outline" disabled={busy || !list.length} onClick={() => selectAll(false)}>Alles uitvinken</Button>
          </div>
          <p className="mb-2 text-sm text-muted-foreground">{sel.size} product(en) toegewezen</p>
          <ul className="divide-y">
            {list.map((p) => (
              <li key={p.id}><label className="flex min-h-11 items-center gap-3 py-1">
                <input type="checkbox" className="h-5 w-5" checked={sel.has(p.id)} disabled={busy} onChange={(e) => toggle(p.id, e.target.checked)} />
                <span className="flex-1">{p.alias ? `${p.alias} — ${p.name}` : p.name}</span>
                <span className="text-xs text-muted-foreground">{p.unit}</span>
              </label></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
