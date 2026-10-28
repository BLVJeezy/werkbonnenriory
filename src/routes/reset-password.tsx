import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nieuw wachtwoord — Riory Werkbonnen" }, { name: "description", content: "Stel veilig een nieuw wachtwoord in voor je Riory-account." }, { property: "og:title", content: "Nieuw wachtwoord — Riory Werkbonnen" }, { property: "og:description", content: "Stel veilig een nieuw wachtwoord in voor je Riory-account." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const recovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && recovery && session)) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error("Wijzigen mislukt. Vraag een nieuwe herstellink aan of kies een sterker wachtwoord."); return; }
    setPassword("");
    toast.success("Je nieuwe wachtwoord is opgeslagen.");
    await navigate({ to: "/werkbonnen" });
  }
  return <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-md border-t-8 border-primary bg-card p-6 shadow-xl">
      <h1 className="text-2xl font-black uppercase">Nieuw wachtwoord</h1>
      {ready ? <><Label htmlFor="new-password">Nieuw wachtwoord</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /><Button className="w-full" disabled={busy}>{busy ? "Bezig…" : "Wachtwoord opslaan"}</Button></> : <><p className="text-muted-foreground">Open de herstellink uit je e-mail. Is die verlopen? Vraag een nieuwe aan.</p><Button type="button" onClick={() => navigate({ to: "/auth" })}>Naar inloggen</Button></>}
    </form>
  </div>;
}