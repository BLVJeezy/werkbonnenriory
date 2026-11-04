import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignCustomerBranches, geocodeBranch } from "@/lib/distance.functions";
import { branchAddress } from "@/lib/branches";

const empty = { name: "", street: "", house_number: "", postal_code: "", city: "", country: "BE", dutch_billing: false };

export function VestigingenBeheer() {
  const qc = useQueryClient();
  const geo = useServerFn(geocodeBranch);
  const assign = useServerFn(assignCustomerBranches);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("*").order("name")).data ?? [],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["branches"] });

  async function locate(id: string) {
    const r = await geo({ data: { id } });
    if (!r.ok) toast.error("Adres van de vestiging niet gevonden op de kaart. Controleer straat, postcode en plaats.");
    refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    const { data, error } = await supabase.from("branches").insert(form).select("id").single();
    if (error) { toast.error(error.message); setBusy(null); return; }
    await locate(data.id);
    setForm(empty);
    setBusy(null);
    toast.success("Vestiging toegevoegd");
  }

  async function patch(id: string, p: { active?: boolean; dutch_billing?: boolean }, relocate = false) {
    const { error } = await supabase.from("branches").update(p).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (relocate) await locate(id); else refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Vestiging ${name} verwijderen? Klanten en werkbonnen verliezen dit label; bewaarde kilometers blijven staan.`)) return;
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }

  async function assignAll() {
    if (!confirm("Alle klanten zonder handmatige keuze aan de dichtstbijzijnde vestiging koppelen? Dit kan enkele minuten duren.")) return;
    setBusy("assign");
    let offset = 0, total = 0;
    try {
      for (;;) {
        const r = await assign({ data: { offset } });
        total += r.assigned;
        toast.message(`${total} klanten gekoppeld…`, { id: "assign" });
        if (r.done) break;
        offset = r.next;
      }
      toast.success(`${total} klanten aan een vestiging gekoppeld`, { id: "assign" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Koppelen mislukt", { id: "assign" });
    }
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Kilometers worden berekend vanaf de dichtstbijzijnde actieve vestiging, en de klant krijgt het label van die vestiging. Zonder vestigingen geldt het vertrekadres hieronder bij Tarieven.
      </p>
      <form onSubmit={add} className="grid gap-2 rounded-md border bg-card p-4 sm:grid-cols-6">
        <div className="space-y-1 sm:col-span-2"><Label>Naam</Label><Input required placeholder="bv. Genk" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-3"><Label>Straat</Label><Input required value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
        <div className="space-y-1"><Label>Nr.</Label><Input value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })} /></div>
        <div className="space-y-1"><Label>Postcode</Label><Input required value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Plaats</Label><Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        <div className="space-y-1">
          <Label>Land</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value, dutch_billing: e.target.value === "NL" })}>
            <option value="BE">België</option><option value="NL">Nederland</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.dutch_billing} onChange={(e) => setForm({ ...form, dutch_billing: e.target.checked })} />
          Nederlandse facturatieregels
        </label>
        <div className="sm:col-span-6"><Button disabled={busy === "add"}>Vestiging toevoegen</Button></div>
      </form>

      <ul className="divide-y rounded-md border bg-card">
        {branches.length === 0 && <li className="p-4 text-muted-foreground">Nog geen vestigingen.</li>}
        {branches.map((b) => (
          <li key={b.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold uppercase text-primary-foreground">{b.name}</span>
              <span className="text-sm">{branchAddress(b)}</span>
              {b.lat == null && <span className="text-xs font-bold text-destructive">Locatie onbekend — wordt niet gebruikt</span>}
              {b.dutch_billing && <span className="rounded border px-2 py-0.5 text-xs">NL-facturatie</span>}
              {!b.active && <span className="rounded border px-2 py-0.5 text-xs text-muted-foreground">Inactief</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => patch(b.id, { active: !b.active })}>{b.active ? "Deactiveren" : "Activeren"}</Button>
              <Button size="sm" variant="outline" onClick={() => patch(b.id, { dutch_billing: !b.dutch_billing })}>{b.dutch_billing ? "Belgische regels" : "Nederlandse regels"}</Button>
              <Button size="sm" variant="outline" onClick={() => locate(b.id)}>Locatie opnieuw zoeken</Button>
              <Button size="sm" variant="outline" onClick={() => remove(b.id, b.name)}>Verwijderen</Button>
            </div>
          </li>
        ))}
      </ul>
      {branches.some((b) => b.active && b.lat != null) && (
        <Button variant="outline" disabled={busy === "assign"} onClick={assignAll}>Bestaande klanten aan vestigingen koppelen</Button>
      )}
    </div>
  );
}
