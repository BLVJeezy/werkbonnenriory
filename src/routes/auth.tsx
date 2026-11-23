import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginEmail } from "@/lib/login";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Inloggen — Riory Werkbonnen" },
      { name: "description", content: "Log in om werkbonnen te beheren." },
      { property: "og:title", content: "Inloggen — Riory Werkbonnen" },
      { property: "og:description", content: "Log in om werkbonnen te beheren." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "reset" | "new">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("new");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "reset") {
      if (!email.trim().includes("@")) {
        setBusy(false);
        toast.error("Ploegen vragen een nieuw wachtwoord aan de beheerder.");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (error) { toast.error("Herstelmail aanvragen mislukt. Probeer later opnieuw."); return; }
      toast.success("Als dit account bestaat, ontvang je een mail om je wachtwoord te wijzigen.");
    } else if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
      setBusy(false);
      if (error) {
        toast.error("Inloggen mislukt: " + error.message);
        return;
      }
      navigate({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (error) {
        toast.error("Wachtwoord wijzigen mislukt. Gebruik een nieuwe herstellink en een sterk wachtwoord.");
        return;
      }
      setPassword("");
      toast.success("Je nieuwe wachtwoord is opgeslagen.");
      navigate({ to: "/dashboard" });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border border-border/20 border-t-4 border-t-primary bg-card p-7 shadow-2xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-black uppercase tracking-tight">
            Riory <span className="text-primary">Werkbonnen</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "in" ? "Meld je aan met je ploegnaam of e-mailadres." : mode === "reset" ? "Vraag een herstelmail aan voor je wachtwoord." : "Kies een nieuw wachtwoord voor je account."}
          </p>
        </div>
        {mode !== "new" && <div className="space-y-1.5">
          <Label htmlFor="email">Naam ploeg of e-mail</Label>
          <Input id="email" type="text" className="h-10" autoCapitalize="none" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>}
        {mode !== "reset" && <div className="space-y-1.5">
          <Label htmlFor="pw">{mode === "new" ? "Nieuw wachtwoord" : "Wachtwoord"}</Label>
          <Input id="pw" type="password" className="h-10" autoComplete={mode === "new" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>}
        <Button className="h-10 w-full font-semibold" disabled={busy}>
          {busy ? "Bezig…" : mode === "in" ? "Inloggen" : mode === "reset" ? "Herstelmail versturen" : "Nieuw wachtwoord opslaan"}
        </Button>
        {mode !== "new" && <Button type="button" variant="link" className="w-full" onClick={() => { setMode(mode === "reset" ? "in" : "reset"); setPassword(""); }}>
          {mode === "reset" ? "Terug naar inloggen" : "Wachtwoord vergeten?"}
        </Button>}
      </form>
    </div>
  );
}
