import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { euro } from "@/lib/billing";

export const Route = createFileRoute("/_authenticated/tarieven")({
  head: () => ({ meta: [{ title: "Tarieven — Riory Werkbonnen" }, { name: "description", content: "Beheer Riory-activiteiten, uurtarieven en kilometerinstellingen." }, { property: "og:title", content: "Tarieven — Riory Werkbonnen" }, { property: "og:description", content: "Beheer Riory-activiteiten, uurtarieven en kilometerinstellingen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Tarieven,
});

function Tarieven() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const { data } = useQuery({
    queryKey: ["tarieven"],
    queryFn: async () => {
      const [a, s] = await Promise.all([
        supabase.from("activities").select("*").order("name"),
        supabase.from("settings").select("*").eq("id", 1).single(),
      ]);
      return { acts: a.data ?? [], settings: s.data };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tarieven"] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("activities").insert({ name, hourly_rate: Number(rate) || 0 });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setRate("");
    refresh();
  }

  async function saveSetting(patch: { base_address?: string; km_rate?: number }) {
    const { error } = await supabase.from("settings").update(patch).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success("Opgeslagen");
    refresh();
  }

  const s = data?.settings;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black uppercase">Tarieven</h1>
      {s && (
        <section className="grid gap-3 rounded-md border bg-card p-4 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-1">
            <Label>Vertrekadres (voor kilometers)</Label>
            <Input defaultValue={s.base_address} onBlur={(e) => e.target.value !== s.base_address && saveSetting({ base_address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Prijs per km (excl. btw)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              defaultValue={s.km_rate}
              onBlur={(e) => Number(e.target.value) !== Number(s.km_rate) && saveSetting({ km_rate: Number(e.target.value) || 0 })}
            />
          </div>
        </section>
      )}
      <h2 className="text-xl font-black uppercase">Activiteiten</h2>
      <form onSubmit={add} className="flex flex-wrap gap-2 rounded-md border bg-card p-4">
        <Input placeholder="Activiteit (bv. Herstelling)" required value={name} onChange={(e) => setName(e.target.value)} className="min-w-48 flex-1" />
        <Input placeholder="Uurtarief €" type="number" step="0.01" min="0" required value={rate} onChange={(e) => setRate(e.target.value)} className="w-32" />
        <Button>Toevoegen</Button>
      </form>
      <ul className="divide-y rounded-md border bg-card">
        {data?.acts.length === 0 && <li className="p-4 text-muted-foreground">Nog geen activiteiten.</li>}
        {data?.acts.map((a) => (
          <li key={a.id} className="flex items-center justify-between p-4">
            <div>
              <span className="font-bold">{a.name}</span> <span className="font-mono text-sm text-muted-foreground">{euro(Number(a.hourly_rate))}/u</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.from("activities").delete().eq("id", a.id);
                refresh();
              }}
            >
              Verwijderen
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">Het eerste uur wordt altijd volledig aangerekend, daarna per begonnen kwartier.</p>
    </div>
  );
}
