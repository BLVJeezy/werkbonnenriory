import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/use-role";

export const Route = createFileRoute("/_authenticated/ploegvoorraad")({
  head: () => ({ meta: [
    { title: "Ploegvoorraad — Riory" },
    { name: "description", content: "Producten en aantallen toewijzen aan ploegen, beschikbaarheid en historiek." },
    { property: "og:title", content: "Ploegvoorraad — Riory" },
    { property: "og:description", content: "Producten en aantallen toewijzen aan ploegen, beschikbaarheid en historiek." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

const KIND: Record<string, string> = { toewijzing: "Toegewezen", terugname: "Teruggenomen", correctie: "Correctie", verbruik: "Verbruikt op werkbon", verbruik_terug: "Verbruik teruggezet" };

function Page() {
  const role = useRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [tech, setTech] = useState("");
  const techs = useQuery({ queryKey: ["stock_techs"], queryFn: async () => (await supabase.from("technicians").select("id, name").order("name")).data ?? [] });
  const techId = tech || techs.data?.[0]?.id || "";
  const prods = useQuery({ queryKey: ["stock_prods"], queryFn: async () => (await supabase.from("products").select("id, name, alias, unit").order("name")).data ?? [] });
  const stock = useQuery({
    queryKey: ["crew_stock", techId], enabled: !!techId,
    queryFn: async () => (await supabase.from("crew_stock").select("product_id, quantity, updated_at").eq("technician_id", techId)).data ?? [],
  });
  const moves = useQuery({
    queryKey: ["crew_stock_moves", techId], enabled: !!techId,
    queryFn: async () => (await supabase.from("crew_stock_moves").select("*").eq("technician_id", techId).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const pname = (id: string) => { const p = prods.data?.find((x) => x.id === id); return p ? (p.alias ? `${p.alias} — ${p.name}` : p.name) : "?"; };
  const punit = (id: string) => prods.data?.find((x) => x.id === id)?.unit ?? "";
  const [form, setForm] = useState({ product: "", qty: "1", mode: "toewijzing", note: "" });
  const [busy, setBusy] = useState(false);

  async function apply(product: string, mode: string, qty: number, note = "") {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("crew_stock_admin", { p_tech: techId, p_product: product, p_mode: mode, p_quantity: qty, p_note: note });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Opgeslagen");
    qc.invalidateQueries({ queryKey: ["crew_stock", techId] });
    qc.invalidateQueries({ queryKey: ["crew_stock_moves", techId] });
  }

  const rows = (stock.data ?? []).filter((s) => Number(s.quantity) > 0 || isAdmin).sort((a, b) => pname(a.product_id).localeCompare(pname(b.product_id)));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black uppercase">Ploegvoorraad</h1>
      <p className="text-sm text-muted-foreground">Toegewezen producten zijn wat de ploeg bij heeft. Werkelijk verbruik wordt op de werkbon geregistreerd en daar automatisch één keer afgeboekt.</p>
      {isAdmin && (
        <select className="h-10 w-full rounded-md border bg-background px-2 sm:w-72" value={techId} onChange={(e) => setTech(e.target.value)}>
          {(techs.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {isAdmin && techId && (
        <form className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-[1fr_7rem_10rem_1fr_auto]" onSubmit={(e) => {
          e.preventDefault();
          const n = Number(form.qty);
          if (!form.product || !(n >= 0)) { toast.error("Kies een product en een aantal van 0 of meer"); return; }
          apply(form.product, form.mode, n, form.note).then(() => setForm({ ...form, qty: "1", note: "" }));
        }}>
          <select required className="h-10 rounded-md border bg-background px-2" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
            <option value="">— Product —</option>
            {(prods.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.alias ? `${p.alias} — ${p.name}` : p.name} ({p.unit})</option>)}
          </select>
          <Input type="number" min="0" step="any" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          <select className="h-10 rounded-md border bg-background px-2" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="toewijzing">Toewijzen (+)</option>
            <option value="terugname">Terugnemen (−)</option>
            <option value="correctie">Zetten op aantal</option>
          </select>
          <Input placeholder="Opmerking (optioneel)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button disabled={busy}>Opslaan</Button>
        </form>
      )}
      <section className="rounded-md border bg-card p-3">
        <h2 className="mb-2 font-black uppercase">Beschikbaar</h2>
        {rows.length === 0 && <p className="text-muted-foreground">Geen producten toegewezen.</p>}
        <ul className="divide-y">
          {rows.map((s) => (
            <li key={s.product_id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="flex-1">{pname(s.product_id)}</span>
              <span className="font-mono font-bold">{Number(s.quantity)} {punit(s.product_id)}</span>
              {isAdmin && Number(s.quantity) > 0 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm("Alles terugnemen?") && apply(s.product_id, "correctie", 0, "Alles teruggenomen")}>Alles terugnemen</Button>}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-md border bg-card p-3">
        <h2 className="mb-2 font-black uppercase">Historiek</h2>
        <ul className="divide-y text-sm">
          {(moves.data ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap gap-x-3 py-1">
              <span className="font-mono">{new Date(m.created_at).toLocaleString("nl-BE")}</span>
              <span className="flex-1">{KIND[m.kind] ?? m.kind}: {pname(m.product_id)}{m.work_order_id && <> · <Link className="underline" to="/werkbonnen/$id" params={{ id: m.work_order_id }}>werkbon</Link></>}{m.note && <> · {m.note}</>}</span>
              <span className="font-mono">{Number(m.delta) > 0 ? "+" : ""}{Number(m.delta)} → {Number(m.balance_after)}</span>
            </li>
          ))}
          {(moves.data ?? []).length === 0 && <li className="text-muted-foreground">Nog geen mutaties.</li>}
        </ul>
      </section>
    </div>
  );
}
