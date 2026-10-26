import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTechnicianLogin, deleteTechnician } from "@/lib/technicians.functions";

export const Route = createFileRoute("/_authenticated/technici")({
  head: () => ({ meta: [{ title: "Technici — Riory Werkbonnen" }] }),
  component: Technici,
});

const empty = { name: "", phone: "", email: "", password: "" };

function Technici() {
  const qc = useQueryClient();
  const create = useServerFn(createTechnicianLogin);
  const remove = useServerFn(deleteTechnician);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => (await supabase.from("technicians").select("*").order("name")).data ?? [],
  });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: f });
      toast.success(`Login aangemaakt voor ${f.name}`);
      setF(empty);
      qc.invalidateQueries({ queryKey: ["technicians"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black uppercase">Technici</h1>
      <form onSubmit={add} className="grid gap-2 rounded-md border bg-card p-4 sm:grid-cols-2">
        <Input placeholder="Naam" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="Telefoon" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="E-mail (login)" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input placeholder="Wachtwoord (min. 6 tekens)" type="text" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Button disabled={busy} className="sm:col-span-2">
          {busy ? "Aanmaken…" : "Technieker + login aanmaken"}
        </Button>
      </form>
      <ul className="divide-y rounded-md border bg-card">
        {data.length === 0 && <li className="p-4 text-muted-foreground">Nog geen technici.</li>}
        {data.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-bold">{t.name}</div>
              <div className="text-sm text-muted-foreground">
                {[t.email ?? "geen login", t.phone].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!confirm(`${t.name} en zijn login verwijderen?`)) return;
                try {
                  await remove({ data: { id: t.id } });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Mislukt");
                }
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
