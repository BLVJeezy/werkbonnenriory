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
      navigate({ to: "/werkbonnen" });
    } else {
      const { error } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (error) {
        toast.error("Wachtwoord wijzigen mislukt. Gebruik een nieuwe herstellink en een sterk wachtwoord.");
        return;
      }
      setPassword("");
      toast.success("Je nieuwe wachtwoord is opgeslagen.");
      navigate({ to: "/werkbonnen" });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-md border-t-8 border-primary bg-card p-6 shadow-xl">
        <h1 className="text-2xl font-black uppercase">
          Riory <span className="text-primary">Werkbonnen</span>
        </h1>
        {mode !== "new" && <div className="space-y-1">
          <Label htmlFor="email">Naam ploeg of e-mail</Label>
          <Input id="email" type="text" autoCapitalize="none" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>}
        {mode !== "reset" && <div className="space-y-1">
          <Label htmlFor="pw">{mode === "new" ? "Nieuw wachtwoord" : "Wachtwoord"}</Label>
          <Input id="pw" type="password" autoComplete={mode === "new" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>}
        <Button className="w-full" disabled={busy}>
          {busy ? "Bezig…" : mode === "in" ? "Inloggen" : mode === "reset" ? "Herstelmail versturen" : "Nieuw wachtwoord opslaan"}
        </Button>
        {mode !== "new" && <Button type="button" variant="link" className="w-full" onClick={() => { setMode(mode === "reset" ? "in" : "reset"); setPassword(""); }}>
          {mode === "reset" ? "Terug naar inloggen" : "Wachtwoord vergeten?"}
        </Button>}
      </form>
    </div>
  );
}
