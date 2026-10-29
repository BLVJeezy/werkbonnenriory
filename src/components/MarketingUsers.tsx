import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMarketingLogin, deleteMarketingLogin, listMarketingUsers } from "@/lib/marketing-users.functions";

export function MarketingUsers() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketingUsers), create = useServerFn(createMarketingLogin), remove = useServerFn(deleteMarketingLogin);
  const { data = [] } = useQuery({ queryKey: ["marketing_users"], queryFn: () => list() });
  const [f, setF] = useState({ login: "", password: "" });
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <h2 className="text-xl font-black uppercase">Marketing</h2>
      <p className="text-sm text-muted-foreground">Een marketinglogin ziet enkel Klanten (zonder prijzen), Nieuwsbrieven/mailings en Foto's.</p>
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        try { await create({ data: f }); toast.success(`Marketinglogin ${f.login} aangemaakt`); setF({ login: "", password: "" }); qc.invalidateQueries({ queryKey: ["marketing_users"] }); }
        catch (err) { toast.error(err instanceof Error ? err.message : "Mislukt"); }
        finally { setBusy(false); }
      }}>
        <Input required aria-label="Loginnaam of e-mail" placeholder="Loginnaam of e-mail" className="w-56" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} />
        <Input required minLength={6} type="password" aria-label="Wachtwoord" placeholder="Wachtwoord" className="w-44" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Button type="submit" disabled={busy}>Marketinglogin aanmaken</Button>
      </form>
      <ul className="divide-y">
        {data.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nog geen marketinglogins.</li>}
        {data.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-2">
            <span className="font-bold">{u.login}</span>
            <Button variant="ghost" size="sm" onClick={async () => {
              if (!confirm(`Marketinglogin ${u.login} verwijderen?`)) return;
              try { await remove({ data: { id: u.id } }); } catch (err) { toast.error(err instanceof Error ? err.message : "Mislukt"); }
              qc.invalidateQueries({ queryKey: ["marketing_users"] });
            }}>Verwijderen</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
