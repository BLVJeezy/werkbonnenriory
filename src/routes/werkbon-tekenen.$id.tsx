import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/SignaturePad";
import { werkbonNr } from "@/lib/werkbon-number";
import { getWerkbonForSigning, signWerkbonWithCode } from "@/lib/work-order-signing.functions";

export const Route = createFileRoute("/werkbon-tekenen/$id")({
  head: () => ({ meta: [{ title: "Werkbon ondertekenen — Riory" }, { name: "description", content: "Bekijk en onderteken je Riory-werkbon digitaal met de code uit de e-mail." }, { property: "og:title", content: "Werkbon ondertekenen — Riory" }, { property: "og:description", content: "Bekijk en onderteken je Riory-werkbon digitaal met de code uit de e-mail." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: WerkbonTekenen,
});

function WerkbonTekenen() {
  const { id } = Route.useParams();
  const get = useServerFn(getWerkbonForSigning);
  const sign = useServerFn(signWerkbonWithCode);
  const [code, setCode] = useState("");
  const [enteredCode, setEnteredCode] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { data: w, error: loadError, isFetching } = useQuery({
    queryKey: ["werkbon-tekenen", id, enteredCode],
    queryFn: () => get({ data: { id, code: enteredCode! } }),
    enabled: enteredCode !== null,
    retry: false,
  });

  async function onderteken() {
    if (!signature || !name.trim() || !enteredCode) return;
    setBusy(true);
    setError(null);
    try {
      await sign({ data: { id, code: enteredCode, signature: signature!, name } });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ondertekenen mislukt");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="rounded-md border-2 border-primary bg-card p-4">
          <p className="text-lg font-bold">Bedankt! De werkbon is digitaal ondertekend.</p>
          <p className="text-sm text-muted-foreground">Je ontvangt de werkbon ook per e-mail.</p>
        </div>
      </Shell>
    );
  }

  if (!enteredCode) {
    return (
      <Shell>
        <h1 className="text-3xl font-black uppercase">Werkbon ondertekenen</h1>
        <p className="text-muted-foreground">Vul de zescijferige code in uit de e-mail van Riory.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(code.trim())) setEnteredCode(code.trim());
          }}
        >
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="Code uit de e-mail"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="font-mono text-lg tracking-widest"
          />
          <Button type="submit" disabled={!/^\d{6}$/.test(code.trim())}>Open werkbon</Button>
        </form>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <p className="text-muted-foreground">Deze code past niet bij deze link. Controleer de code uit de e-mail.</p>
        <Button variant="outline" onClick={() => { setEnteredCode(null); setCode(""); }}>Opnieuw proberen</Button>
      </Shell>
    );
  }
  if (!w || isFetching) return <Shell><p className="text-muted-foreground">Laden…</p></Shell>;

  const minutes = w.minutes;

  return (
    <Shell>
      <h1 className="text-3xl font-black uppercase">Werkbon {werkbonNr(w.number)}</h1>
      <p className="text-muted-foreground">Voor {w.customer}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-md border bg-card p-4 text-sm">
        {w.address && <><dt className="text-muted-foreground">Klantadres</dt><dd className="text-right">{w.address}</dd></>}
        {w.siteAddress && <><dt className="text-muted-foreground">Werfadres</dt><dd className="text-right">{w.siteAddress}</dd></>}
        {w.activity && <><dt className="text-muted-foreground">Activiteit</dt><dd className="text-right">{w.activity}</dd></>}
        {w.signedAt && <><dt className="text-muted-foreground">Datum</dt><dd className="text-right">{new Date(w.signedAt).toLocaleString("nl-BE")}</dd></>}
        <dt className="text-muted-foreground">Gewerkte tijd</dt><dd className="text-right">{Math.floor(minutes / 60)} u {minutes % 60} min</dd>
        {w.distanceKm != null && <><dt className="text-muted-foreground">Kilometers heen en terug</dt><dd className="text-right">{w.distanceKm.toLocaleString("nl-BE")} km</dd></>}
        {w.warranty && <><dt className="text-muted-foreground">Onder garantie</dt><dd className="text-right">Ja</dd></>}
      </dl>
      {w.description && <p className="rounded-md border bg-card p-4 text-sm">{w.description}</p>}
      {w.materials.length > 0 && (
        <ul className="divide-y rounded-md border bg-card">
          {w.materials.map((m, i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <span className="flex-1">{m.name}</span>
              <span className="font-mono text-sm">{m.quantity} {m.unit}</span>
            </li>
          ))}
        </ul>
      )}
      {w.signed ? (
        <div className="rounded-md border-2 border-primary bg-card p-4">
          <p className="text-lg font-bold">Deze werkbon is al ondertekend.</p>
          <p className="text-sm text-muted-foreground">Ondertekend door {w.signedName}{w.signedAt ? ` op ${new Date(w.signedAt).toLocaleString("nl-BE")}` : ""}.</p>
        </div>
      ) : (
        <section className="space-y-3 rounded-md border-2 border-primary bg-card p-4">
          <h2 className="text-lg font-black uppercase">Akkoord? Onderteken hier</h2>
          <SignaturePad onChange={setSignature} />
          <Input placeholder="Je naam" value={name} onChange={(e) => setName(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="lg" disabled={!signature || !name.trim() || busy} onClick={onderteken}>
            {busy ? "Bezig…" : "Onderteken de werkbon"}
          </Button>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-primary bg-secondary text-secondary-foreground">
        <div className="mx-auto max-w-3xl px-4 py-3 text-lg font-black uppercase tracking-tight">Riory <span className="text-primary">Werkbon</span></div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
