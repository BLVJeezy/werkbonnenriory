import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/technici")({
  head: () => ({ meta: [{ title: "Technici — Riory Werkbonnen" }] }),
  component: Technici,
});

function Technici() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => (await supabase.from("technicians").select("*").order("name")).data ?? [],
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("technicians").insert({ name, phone: phone || null });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setPhone("");
    qc.invalidateQueries({ queryKey: ["technicians"] });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black uppercase">Technici</h1>
      <form onSubmit={add} className="flex flex-wrap gap-2 rounded-md border bg-card p-4">
        <Input placeholder="Naam" required value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Input placeholder="Telefoon" value={phone} onChange={(e) => setPhone(e.target.value)} className="max-w-xs" />
        <Button>Toevoegen</Button>
      </form>
      <ul className="divide-y rounded-md border bg-card">
        {data.length === 0 && <li className="p-4 text-muted-foreground">Nog geen technici.</li>}
        {data.map((t) => (
          <li key={t.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-bold">{t.name}</div>
              <div className="text-sm text-muted-foreground">{t.phone}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.from("technicians").delete().eq("id", t.id);
                qc.invalidateQueries({ queryKey: ["technicians"] });
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
