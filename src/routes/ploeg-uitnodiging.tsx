import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readCrewInvitation, acceptCrewInvitation } from "@/lib/crew-invitation.functions";

export const Route = createFileRoute("/ploeg-uitnodiging")({
  head: () => ({ meta: [{ title: "Ploeguitnodiging — Riory Werkbonnen" }, { name: "description", content: "Kies je eigen wachtwoord voor je Riory-ploeglogin." }, { property: "og:title", content: "Ploeguitnodiging — Riory Werkbonnen" }, { property: "og:description", content: "Activeer veilig je ploeglogin met een persoonlijk wachtwoord." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CrewInvitation,
});

function CrewInvitation() {
  const read = useServerFn(readCrewInvitation);
  const accept = useServerFn(acceptCrewInvitation);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(code)) { setError("Open de persoonlijke uitnodigingslink uit WhatsApp."); setLoading(false); return; }
    setToken(code);
    let alive = true;
    read({ data: { token: code } }).then((result) => { if (alive) setName(result.name); }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Uitnodiging niet beschikbaar"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [read]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) { setError("De wachtwoorden zijn niet gelijk."); return; }
    setBusy(true); setError("");
    try {
      await accept({ data: { token, password } });
      setDone(true); setPassword(""); setRepeat(""); setToken("");
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) { setError(e instanceof Error ? e.message : "Opslaan mislukt"); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8">
    <section className="w-full max-w-md space-y-5 rounded-md border-t-8 border-primary bg-card p-6 shadow-xl">
      <h1 className="text-2xl font-black uppercase">Riory <span className="text-primary">Werkbonnen</span></h1>
      {loading ? <p>Uitnodiging controleren…</p> : done ? <><h2 className="text-lg font-bold">Je wachtwoord is opgeslagen</h2><p>Loginnaam: <strong>{name}</strong></p><Button asChild className="w-full"><Link to="/auth">Naar inloggen</Link></Button></> : name ? <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-bold">Welkom, {name}</h2><p className="text-sm text-muted-foreground">Loginnaam: <strong>{name}</strong></p>
        <div className="space-y-2"><Label htmlFor="crew-password">Kies je wachtwoord</Label><Input id="crew-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="crew-repeat">Herhaal je wachtwoord</Label><Input id="crew-repeat" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={repeat} onChange={(e) => setRepeat(e.target.value)} /></div>
        <p className="text-sm text-muted-foreground">Minstens 8 tekens. Deel deze persoonlijke link niet.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Opslaan…" : "Wachtwoord opslaan"}</Button>
      </form> : <><p role="alert" className="text-destructive">{error}</p><Button asChild variant="outline"><Link to="/auth">Naar inloggen</Link></Button></>}
    </section>
  </main>;
}