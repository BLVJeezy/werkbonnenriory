import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, Mail } from "lucide-react";
import logo from "@/assets/riory-mail-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RIORY_WEBSITE_URL,
  sanitizePortalNext,
  validPortalLoginToken,
} from "@/lib/customer-portal";
import { requestPortalLogin } from "@/lib/customer-portal.functions";

export const Route = createFileRoute("/portaal/inloggen")({
  head: () => ({
    meta: [
      { title: "Inloggen — Riory Klantenportaal" },
      {
        name: "description",
        content:
          "Log in op het Riory-klantenportaal met het e-mailadres van uw facturen en bekijk uw werkbonnen, facturen en offertes.",
      },
      { property: "og:title", content: "Inloggen — Riory Klantenportaal" },
      {
        property: "og:description",
        content: "Uw werkbonnen, facturen en offertes bij Riory op één plek.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

type Mode = "link" | "sent" | "password" | "reset" | "verifying";

function nextPath() {
  return sanitizePortalNext(new URLSearchParams(window.location.search).get("next"));
}

function PortalLoginPage() {
  const navigate = useNavigate();
  const requestLink = useServerFn(requestPortalLogin);
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function goIn() {
    const to = nextPath();
    if (to !== "/portaal") window.location.assign(to);
    else navigate({ to: "/portaal" });
  }

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("login");
    if (token && validPortalLoginToken(token)) {
      setMode("verifying");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      (async () => {
        let res = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
        if (res.error) res = await supabase.auth.verifyOtp({ token_hash: token, type: "email" });
        if (res.error || !res.data.session) {
          setError("Deze inloglink is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.");
          setMode("link");
          return;
        }
        goIn();
      })();
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goIn();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    setBusy(true);
    try {
      if (mode === "link") {
        await requestLink({ data: { email: cleanEmail } });
        setMode("sent");
      } else if (mode === "reset") {
        await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        toast.success(
          "Als dit e-mailadres gekend is, ontvangt u een mail om uw wachtwoord te wijzigen.",
        );
        setMode("password");
      } else if (mode === "password") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError)
          throw new Error("Inloggen mislukt. Controleer uw e-mailadres en wachtwoord.");
        goIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Er ging iets mis. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#f6f5f2]">
      <div className="h-1.5 w-full bg-primary" />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="flex items-center justify-between">
            <img src={logo.url} alt="Riory" className="h-9 w-auto" />
            <a
              href={RIORY_WEBSITE_URL}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> riory.be
            </a>
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]">
            {mode === "verifying" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <LoaderCircle className="size-7 animate-spin text-primary" />
                <p className="font-semibold">U wordt ingelogd…</p>
              </div>
            ) : mode === "sent" ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="size-6 text-primary" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-bold tracking-tight">Check uw mailbox</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Is{" "}
                    <span className="font-medium text-foreground">
                      {email.trim().toLowerCase()}
                    </span>{" "}
                    bij ons gekend? Dan ontvangt u binnen een minuut een inloglink van Riory.
                  </p>
                </div>
                <ul className="space-y-1.5 rounded-xl bg-[#f6f5f2] p-4 text-left text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    Gebruik het e-mailadres waarop u facturen van Riory ontvangt.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    Kijk ook even in uw map ongewenste e-mail.
                  </li>
                </ul>
                <Button variant="ghost" className="w-full" onClick={() => setMode("link")}>
                  Ander e-mailadres gebruiken
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-bold tracking-tight">Klantenportaal</h1>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {mode === "link"
                      ? "Log in met het e-mailadres waarop u facturen van Riory ontvangt. U krijgt een veilige inloglink, zonder wachtwoord."
                      : mode === "password"
                        ? "Log in met uw e-mailadres en wachtwoord."
                        : "Vul uw e-mailadres in om een nieuw wachtwoord in te stellen."}
                  </p>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="portal-email">E-mailadres</Label>
                  <Input
                    id="portal-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="naam@voorbeeld.be"
                    required
                    className="h-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {mode === "password" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="portal-pw">Wachtwoord</Label>
                    <Input
                      id="portal-pw"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="h-11"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}

                <Button className="h-11 w-full text-[15px] font-semibold" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : mode === "link" ? (
                    "Stuur mij een inloglink"
                  ) : mode === "password" ? (
                    "Inloggen"
                  ) : (
                    "Herstelmail versturen"
                  )}
                </Button>

                <div className="flex flex-col items-center gap-1 border-t pt-4 text-sm">
                  {mode === "link" ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setError("");
                        setMode("password");
                      }}
                    >
                      <KeyRound className="size-3.5" /> Inloggen met wachtwoord
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setError("");
                          setMode("link");
                        }}
                      >
                        Inloggen met een inloglink
                      </button>
                      {mode === "password" && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setError("");
                            setMode("reset");
                          }}
                        >
                          Wachtwoord vergeten?
                        </button>
                      )}
                    </>
                  )}
                </div>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Vragen? Mail naar{" "}
            <a className="underline underline-offset-2" href="mailto:info@riory.be">
              info@riory.be
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
