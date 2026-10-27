import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
      setBusy(false);
      if (error) {
        toast.error("Inloggen mislukt: " + error.message);
        return;
      }
      navigate({ to: "/werkbonnen" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Bevestig je account via de link in je mail.");
      setMode("in");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-md border-t-8 border-primary bg-card p-6 shadow-xl">
        <h1 className="text-2xl font-black uppercase">
          Riory <span className="text-primary">Werkbonnen</span>
        </h1>
        <div className="space-y-1">
          <Label htmlFor="email">Naam ploeg of e-mail</Label>
          <Input id="email" type="text" autoCapitalize="none" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw">Wachtwoord</Label>
          <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button className="w-full" disabled={busy}>
          {mode === "in" ? "Inloggen" : "Account aanmaken"}
        </Button>
      </form>
    </div>
  );
}
