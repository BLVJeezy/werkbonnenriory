import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/producten")({
  head: () => ({ meta: [{ title: "Producten — Riory Werkbonnen" }] }),
  component: Producten,
});

function Producten() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("st");
  const { data = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("products").insert({ name, unit: unit || "st" });
    if (error) return toast.error(error.message);
    setName("");
    setUnit("st");
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black uppercase">Producten</h1>
      <form onSubmit={add} className="flex flex-wrap gap-2 rounded-md border bg-card p-4">
        <Input placeholder="Productnaam" required value={name} onChange={(e) => setName(e.target.value)} className="min-w-48 flex-1" />
        <Input placeholder="Eenheid" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-24" />
        <Button>Toevoegen</Button>
      </form>
      <ul className="divide-y rounded-md border bg-card">
        {data.length === 0 && <li className="p-4 text-muted-foreground">Nog geen producten.</li>}
        {data.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-4">
            <div>
              <span className="font-bold">{p.name}</span> <span className="font-mono text-sm text-muted-foreground">({p.unit})</span>
            </div>
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
