import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/SignaturePad";
import { euro } from "@/lib/billing";
import type { InvoiceCustomer, InvoiceLine } from "@/lib/invoice";
import { splitLineText } from "@/lib/line-text";
import { getQuoteByToken, signQuote } from "@/lib/quotes.functions";
import { lineDiscount, quoteDiscountTotal } from "@/lib/quote";
import { ProductPhotoGallery } from "@/components/ProductPhotos";

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
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: q, error: loadError } = useQuery({ queryKey: ["quote", token], queryFn: () => get({ data: { token } }) });

  if (loadError) return <Shell><p className="text-muted-foreground">Deze offertelink is ongeldig of verlopen.</p></Shell>;
  if (!q) return <Shell><p className="text-muted-foreground">Laden…</p></Shell>;

  const c = q.customer as InvoiceCustomer;
  const allLines = q.lines as InvoiceLine[];
  const lines = allLines.filter((l) => !l.optional);
  const optionLines = allLines.map((l, i) => ({ line: l, index: i })).filter((x) => x.line.optional);
  const signed = q.status === "akkoord";
  const vatRate = Number(q.vat_rate);
  const chosenNet = optionLines.filter((x) => chosen.has(x.index)).reduce((s, x) => s + x.line.amount, 0);
  const chosenTotal = Math.round(chosenNet * (1 + vatRate / 100) * 100) / 100;
  const grandTotal = Math.round((Number(q.total) + chosenTotal) * 100) / 100;

  async function onderteken() {
    if (!signature || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sign({ data: { token, signature, name, options: [...chosen] } });
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
        {lines.map((l, i) => {
          const { title, detail } = splitLineText(l.description);
          return (
            <li key={i} className="flex items-start gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{title}</span>
                {discountLabel(l, euro) && <span className="mt-0.5 block text-sm font-semibold text-primary">{discountLabel(l, euro)}</span>}
                {detail && <span className="mt-1 block whitespace-pre-line border-l-2 border-primary/40 pl-3 text-sm leading-snug text-muted-foreground">{detail}</span>}
                <ProductPhotoGallery paths={l.photoPaths ?? []} title={title} urls={q.photoUrls} />
              </span>
              <span className="whitespace-nowrap font-mono text-sm">{l.quantity} {l.unit}</span>
              <span className="whitespace-nowrap font-mono text-sm">{euro(l.amount)}</span>
            </li>
          );
        })}
      </ul>
      <dl className="ml-auto grid w-64 grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-sm">
        {quoteDiscountTotal(lines).saved > 0 && <>
          <dt>Prijs zonder korting</dt><dd className="text-right line-through">{euro(quoteDiscountTotal(lines).beforeDiscount)}</dd>
          <dt className="font-bold text-primary">Uw korting</dt><dd className="text-right font-bold text-primary">- {euro(quoteDiscountTotal(lines).saved)}</dd>
        </>}
        <dt>Totaal excl. btw</dt><dd className="text-right">{euro(Number(q.net))}</dd>
        <dt>Btw {Number(q.vat_rate)}%</dt><dd className="text-right">{euro(Number(q.vat))}</dd>
        <dt className="text-lg font-black">Totaal incl. btw</dt><dd className="text-right text-lg font-black">{euro(Number(q.total))}</dd>
      </dl>
      {optionLines.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-black uppercase text-primary">{signed ? "Niet gekozen opties — worden niet uitgevoerd" : "Opties — klik aan wat je wil meenemen"}</h2>
          <p className="text-sm text-muted-foreground">{signed ? "Je gekozen opties staan hierboven in de offerte. Deze opties heb je niet gekozen." : "Deze opties zijn niet inbegrepen in het totaal hierboven. Vink aan welke je wil; ze worden dan mee ondertekend en aangerekend."}</p>
          <ul className="divide-y rounded-md border bg-card">
            {optionLines.map(({ line: l, index }) => {
              const { title, detail } = splitLineText(l.description);
              const on = chosen.has(index);
              // Once a choice is made (or the offer is signed), unchosen options fade so nobody confuses them with the chosen work.
              const faded = signed || (chosen.size > 0 && !on);
              return (
                <li key={index}>
                  <label className={`flex cursor-pointer items-start gap-3 p-3 transition-opacity ${on ? "bg-accent ring-2 ring-inset ring-primary" : ""} ${faded ? "opacity-40 grayscale" : ""} ${signed ? "cursor-default" : ""}`}>
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={on}
                      disabled={signed}
                      onChange={() => setChosen((s) => { const n = new Set(s); if (n.has(index)) n.delete(index); else n.add(index); return n; })}
                      aria-label={`Optie ${title}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{title}</span>
                      {discountLabel(l, euro) && <span className="mt-0.5 block text-sm font-semibold text-primary">{discountLabel(l, euro)}</span>}
                      {detail && <span className="mt-1 block whitespace-pre-line border-l-2 border-primary/40 pl-3 text-sm leading-snug text-muted-foreground">{detail}</span>}
                      <ProductPhotoGallery paths={l.photoPaths ?? []} title={title} urls={q.photoUrls} />
                    </span>
                    <span className="whitespace-nowrap font-mono text-sm">{l.quantity} {l.unit}</span>
                    <span className="whitespace-nowrap font-mono text-sm">{euro(l.amount)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {chosen.size > 0 && (
            <dl className="ml-auto grid w-64 grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-sm">
              <dt>Gekozen opties incl. btw</dt><dd className="text-right">{euro(chosenTotal)}</dd>
              <dt className="text-lg font-black">Nieuw totaal incl. btw</dt><dd className="text-right text-lg font-black">{euro(grandTotal)}</dd>
            </dl>
          )}
        </section>
      )}
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
