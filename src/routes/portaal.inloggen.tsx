import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RIORY_WEBSITE_URL, sanitizePortalNext } from "@/lib/customer-portal";

export const Route = createFileRoute("/portaal/inloggen")({
  head: () => ({
    meta: [
      { title: "Klantenportaal inloggen — Riory" },
      { name: "description", content: "Log in op het vaste-klantenportaal van Riory om afspraken aan te vragen en uw dossier te bekijken." },
      { property: "og:title", content: "Klantenportaal inloggen — Riory" },
      { property: "og:description", content: "Log in op het vaste-klantenportaal van Riory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setBusy(false);
      if (error) {
        toast.error("Herstelmail aanvragen mislukt. Probeer later opnieuw.");
        return;
      }
      toast.success("Als dit e-mailadres bekend is, ontvangt u een mail om uw wachtwoord te wijzigen.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error("Inloggen mislukt. Controleer uw e-mailadres en wachtwoord.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextPath = sanitizePortalNext(params.get("next"));
    if (nextPath !== "/portaal") {
      window.location.assign(nextPath);
      return;
    }
    navigate({ to: "/portaal" });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-secondary px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <a
          href={RIORY_WEBSITE_URL}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-secondary-foreground/80 hover:text-secondary-foreground"
        >
          <ArrowLeft className="size-4" />
          Terug naar riory.be
        </a>
        <form
          onSubmit={submit}
          className="space-y-5 rounded-xl border border-border/20 border-t-4 border-t-primary bg-card p-7 shadow-2xl"
        >
          <div className="space-y-1">
            <h1 className="text-2xl font-black uppercase tracking-tight">
              Riory <span className="text-primary">Klantenportaal</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "in"
                ? "Meld u aan als vaste klant om een afspraak aan te vragen of uw opdrachten en facturen te bekijken."
                : "Vul uw e-mailadres in om een herstellink voor uw wachtwoord te ontvangen."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portal-email">E-mailadres</Label>
            <Input
              id="portal-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode === "in" && (
            <div className="space-y-1.5">
              <Label htmlFor="portal-pw">Wachtwoord</Label>
              <Input
                id="portal-pw"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <Button className="h-10 w-full font-semibold" disabled={busy}>
            {busy ? "Bezig…" : mode === "in" ? "Inloggen" : "Herstelmail versturen"}
          </Button>
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => {
              setMode(mode === "reset" ? "in" : "reset");
              setPassword("");
            }}
          >
            {mode === "reset" ? "Terug naar inloggen" : "Wachtwoord vergeten?"}
          </Button>
          <p className="border-t pt-3 text-center text-xs text-muted-foreground">
            Nog geen toegang? Vraag uw persoonlijke uitnodiging aan via info@riory.be.
          </p>
        </form>
      </div>
    </main>
  );
}