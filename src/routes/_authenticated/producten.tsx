import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { euro } from "@/lib/billing";

export const Route = createFileRoute("/_authenticated/producten")({
  head: () => ({ meta: [{ title: "Producten — Riory Werkbonnen" }, { name: "description", content: "Beheer de producten en materialen voor Riory-werkbonnen." }, { property: "og:title", content: "Producten — Riory Werkbonnen" }, { property: "og:description", content: "Beheer de producten en materialen voor Riory-werkbonnen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Producten,
});

function Producten() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("st");
  const [price, setPrice] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("products").insert({ name, unit: unit || "st", price: Number(price) || 0, admin_only: adminOnly });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setUnit("st");
    setPrice("");
    setAdminOnly(false);
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black uppercase">Producten</h1>
      <form onSubmit={add} className="flex flex-wrap gap-2 rounded-md border bg-card p-4">
        <Input placeholder="Productnaam" required value={name} onChange={(e) => setName(e.target.value)} className="min-w-48 flex-1" />
        <Input placeholder="Eenheid" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-24" />
        <Input placeholder="Prijs € excl. btw" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-36" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} />
          Enkel voor beheerder
        </label>
        <Button>Toevoegen</Button>
      </form>
      <ul className="divide-y rounded-md border bg-card">
        {data.length === 0 && <li className="p-4 text-muted-foreground">Nog geen producten.</li>}
        {data.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-4">
            <div>
              <span className="font-bold">{p.name}</span> <span className="font-mono text-sm text-muted-foreground">({p.unit}) · {euro(Number(p.price))}</span>
              {p.admin_only && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-bold">Enkel beheerder</span>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={p.admin_only} onChange={async (e) => {
                await supabase.from("products").update({ admin_only: e.target.checked }).eq("id", p.id);
                qc.invalidateQueries({ queryKey: ["products"] });
              }} />
              Enkel beheerder
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.from("products").delete().eq("id", p.id);
                qc.invalidateQueries({ queryKey: ["products"] });
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
