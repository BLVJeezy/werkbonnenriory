import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validAdminToken } from "@/lib/admin-accounts";

export const Route = createFileRoute("/admin-uitnodiging")({
  head: () => ({ meta: [{ title: "Beheerderuitnodiging — Riory Werkbonnen" }, { name: "description", content: "Activeer je beheerderaccount en kies je eigen wachtwoord voor Riory Werkbonnen." }, { property: "og:title", content: "Beheerderuitnodiging — Riory Werkbonnen" }, { property: "og:description", content: "Activeer veilig je beheerderaccount voor Riory Werkbonnen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AdminInvitation,
});

function AdminInvitation() {
  const navigate = useNavigate();
  const [code, setCode] = useState<{ token: string; type: "invite" | "recovery" } | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token"), type = params.get("type");
    if (token && validAdminToken(token) && (type === "invite" || type === "recovery")) setCode({ token, type });
    else setError("Deze uitnodiging is ongeldig. Vraag je beheerder om een nieuwe link.");
  }, []);
  async function activate() {
    if (!code || busy) return;
    setBusy(true); setError("");
    try {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: code.token, type: code.type });
      if (error || !data.user || !data.session) throw new Error("Deze uitnodiging is verlopen of al gebruikt. Vraag een nieuwe link.");
      const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
      if (roleError || !isAdmin) { await supabase.auth.signOut(); throw new Error("Dit account heeft geen beheertoegang."); }
      setEmail(data.user.email ?? ""); setReady(true); setCode(null);
      window.history.replaceState(null, "", window.location.pathname);
    } catch (error) { setError(error instanceof Error ? error.message : "Activeren mislukt."); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8">
    <div className="w-full max-w-md space-y-5 rounded-md border-t-8 border-primary bg-card p-6 text-card-foreground shadow-xl">
      <h1 className="text-2xl font-black uppercase">Riory Werkbonnen</h1><h2 className="text-lg font-bold">Beheerderuitnodiging</h2>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {ready ? <form className="space-y-4" onSubmit={async (event) => {
        event.preventDefault(); if (busy) return;
        if (password !== repeat) { setError("De wachtwoorden komen niet overeen."); return; }
        setBusy(true); setError("");
        try {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw new Error("Opslaan mislukt. Kies een sterker wachtwoord of vraag een nieuwe link.");
          setPassword(""); setRepeat(""); await navigate({ to: "/dashboard" });
        } catch (error) { setError(error instanceof Error ? error.message : "Opslaan mislukt."); }
        finally { setBusy(false); }
      }}>
        <p className="break-all text-sm">{email}</p>
        <div className="space-y-1"><Label htmlFor="invite-password">Nieuw wachtwoord</Label><Input id="invite-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="invite-repeat">Wachtwoord herhalen</Label><Input id="invite-repeat" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={repeat} onChange={(e) => setRepeat(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Bezig…" : "Wachtwoord opslaan"}</Button>
      </form> : <><p className="text-sm text-muted-foreground">Je krijgt volledige beheertoegang tot Riory Werkbonnen. Kies na het openen je eigen wachtwoord.</p><Button disabled={busy || !code} className="w-full" onClick={activate}>{busy ? "Bezig…" : "Uitnodiging openen"}</Button></>}
    </div>
  </main>;
}