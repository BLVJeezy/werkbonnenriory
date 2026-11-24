import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptCustomerPortalInvite, readCustomerPortalInvite } from "@/lib/customer-portal.functions";

export const Route = createFileRoute("/portaal/uitnodiging")({
  head: () => ({
    meta: [
      { title: "Klantenportaal activeren — Riory" },
      { name: "description", content: "Activeer uw persoonlijke toegang tot het Riory klantenportaal." },
      { property: "og:title", content: "Klantenportaal activeren — Riory" },
      { property: "og:description", content: "Kies een wachtwoord voor uw Riory klantenportaal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalInvitePage,
});

function PortalInvitePage() {
  const read = useServerFn(readCustomerPortalInvite);
  const accept = useServerFn(acceptCustomerPortalInvite);
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<{ customerName: string; email: string } | null>(null);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(code)) {
      setError("Open de persoonlijke uitnodigingslink die u van Riory ontving.");
      setLoading(false);
      return;
    }
    setToken(code);
    let alive = true;
    read({ data: { token: code } })
      .then((res) => {
        if (alive) setInfo(res);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Uitnodiging niet beschikbaar.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [read]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) {
      setError("De wachtwoorden zijn niet gelijk.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await accept({ data: { token, password } });
      setDone(true);
      setPassword("");
      setRepeat("");
      setToken("");
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-secondary px-4 py-8">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-border/20 border-t-4 border-t-primary bg-card p-6 shadow-xl">
        <h1 className="text-2xl font-black uppercase">
          Riory <span className="text-primary">Klantenportaal</span>
        </h1>
        {loading ? (
          <p className="text-sm text-muted-foreground">Uitnodiging controleren…</p>
        ) : done && info ? (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Uw toegang is geactiveerd</h2>
            <p className="text-sm text-muted-foreground">
              U kunt nu inloggen met <strong>{info.email}</strong>.
            </p>
            <Button asChild className="w-full">
              <Link to="/portaal/inloggen">Naar inloggen</Link>
            </Button>
          </div>
        ) : info ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold">Welkom, {info.customerName}</h2>
              <p className="text-sm text-muted-foreground">
                E-mailadres: <strong>{info.email}</strong>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-inv-pw">Kies uw wachtwoord</Label>
              <Input
                id="portal-inv-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-inv-rep">Herhaal uw wachtwoord</Label>
              <Input
                id="portal-inv-rep"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Minstens 8 tekens. Deze persoonlijke link is eenmalig geldig.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={busy}>
              {busy ? "Opslaan…" : "Wachtwoord opslaan"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/portaal/inloggen">Naar inloggen</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}