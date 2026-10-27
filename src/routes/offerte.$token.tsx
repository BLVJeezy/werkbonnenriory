import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/SignaturePad";
import { euro } from "@/lib/billing";
import type { InvoiceCustomer, InvoiceLine } from "@/lib/invoice";
import { getQuoteByToken, signQuote } from "@/lib/quotes.functions";

export const Route = createFileRoute("/offerte/$token")({
  head: () => ({ meta: [{ title: "Offerte ondertekenen — Riory" }, { name: "description", content: "Bekijk en onderteken je Riory-offerte digitaal." }, { property: "og:title", content: "Offerte ondertekenen — Riory" }, { property: "og:description", content: "Bekijk en onderteken je Riory-offerte digitaal." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: OfferteTekenen,
});

function OfferteTekenen() {
  const { token } = Route.useParams();
  const get = useServerFn(getQuoteByToken);
  const sign = useServerFn(signQuote);
  const [signature, setSignature] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: q, error: loadError } = useQuery({ queryKey: ["quote", token], queryFn: () => get({ data: { token } }) });

  if (loadError) return <Shell><p className="text-muted-foreground">Deze offertelink is ongeldig of verlopen.</p></Shell>;
  if (!q) return <Shell><p className="text-muted-foreground">Laden…</p></Shell>;

  const c = q.customer as InvoiceCustomer;
  const lines = q.lines as InvoiceLine[];
  const signed = q.status === "akkoord";

  async function onderteken() {
    if (!signature || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sign({ data: { token, signature: signature!, name } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ondertekenen mislukt");
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-3xl font-black uppercase">Offerte {q.number}</h1>
      <p className="text-muted-foreground">Voor {c.name} · {new Date(q.created_at).toLocaleDateString("nl-BE")}</p>
      <ul className="divide-y rounded-md border bg-card">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-3 p-3">
            <span className="flex-1">{l.description}</span>
            <span className="font-mono text-sm">{l.quantity} {l.unit}</span>
            <span className="font-mono text-sm">{euro(l.amount)}</span>
          </li>
        ))}
      </ul>
      <dl className="ml-auto grid w-64 grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-sm">
        <dt>Totaal excl. btw</dt><dd className="text-right">{euro(Number(q.net))}</dd>
        <dt>Btw {Number(q.vat_rate)}%</dt><dd className="text-right">{euro(Number(q.vat))}</dd>
        <dt className="text-lg font-black">Totaal incl. btw</dt><dd className="text-right text-lg font-black">{euro(Number(q.total))}</dd>
      </dl>
      {signed ? (
        <div className="rounded-md border-2 border-primary bg-card p-4">
          <p className="text-lg font-bold">Deze offerte is akkoord.</p>
          <p className="text-sm text-muted-foreground">Ondertekend door {q.signed_name} op {q.signed_at && new Date(q.signed_at).toLocaleString("nl-BE")}. Riory neemt contact op voor de uitvoering.</p>
        </div>
      ) : (
        <section className="space-y-3 rounded-md border-2 border-primary bg-card p-4">
          <h2 className="text-lg font-black uppercase">Akkoord? Onderteken hier</h2>
          <SignaturePad onChange={setSignature} />
          <Input placeholder="Je naam" value={name} onChange={(e) => setName(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="lg" disabled={!signature || !name.trim() || busy} onClick={onderteken}>
            {busy ? "Bezig…" : "Onderteken en keur goed"}
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
        <div className="mx-auto max-w-3xl px-4 py-3 text-lg font-black uppercase tracking-tight">Riory <span className="text-primary">Offerte</span></div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
