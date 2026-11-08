import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HANDLEIDING_VERSIE, processenVoor, type Doelgroep } from "@/lib/processen";
import { ProcessFlow } from "@/components/ProcessFlow";
import { useRole } from "@/lib/use-role";
import logo from "@/assets/riory-mail-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/handleiding")({
  head: () => ({
    meta: [
      { title: "Handleiding — Riory Werkbonnen" },
      { name: "description", content: "Stroomschema's en uitgebreide uitleg van elk proces voor beheerders en ploegen, als PDF." },
      { property: "og:title", content: "Handleiding — Riory Werkbonnen" },
      { property: "og:description", content: "Stroomschema's en uitgebreide uitleg van elk proces, als PDF." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HandleidingPage,
});

type Vorm = "schema" | "uitgebreid";

function HandleidingPage() {
  const role = useRole();
  const isAdmin = role === "admin";
  const [doc, setDoc] = useState<Doelgroep>("admin");
  const [vorm, setVorm] = useState<Vorm>("schema");
  const doelgroep: Doelgroep = isAdmin ? doc : "ploeg";
  const lijst = processenVoor(doelgroep);
  const titel = doelgroep === "admin" ? "Handleiding beheerder" : "Handleiding ploegen";

  const send = async () => {
    const url = `${window.location.origin}/handleiding`;
    const text = `${titel} — Riory Werkbonnen: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: titel, text, url }); return; } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
      }
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(titel)}&body=${encodeURIComponent(text + "\n\nOpen de link en kies 'Download PDF' om ze te bewaren.")}`;
  };

  return (
    <div className="handleiding-print mx-auto max-w-4xl p-2">
      <div className="no-print mb-4 space-y-3">
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-sm font-bold">Document:</span>
            <Button size="sm" variant={doc === "admin" ? "default" : "outline"} onClick={() => setDoc("admin")}>Beheerder</Button>
            <Button size="sm" variant={doc === "ploeg" ? "default" : "outline"} onClick={() => setDoc("ploeg")}>Ploegen</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-sm font-bold">Vorm:</span>
          <Button size="sm" variant={vorm === "schema" ? "default" : "outline"} onClick={() => setVorm("schema")}>Stroomschema's</Button>
          <Button size="sm" variant={vorm === "uitgebreid" ? "default" : "outline"} onClick={() => setVorm("uitgebreid")}>Zeer uitgebreid</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>Download PDF</Button>
          <Button variant="outline" onClick={send}>Verzenden</Button>
        </div>
        <p className="text-sm text-muted-foreground">Bij 'Download PDF' kies je in het venster "Opslaan als PDF".{isAdmin ? " Via 'Hulp aan' in het menu zie je deze schema's ook bovenaan elk scherm." : ""}</p>
      </div>

      <header className="mb-6 flex items-center justify-between border-b-4 border-primary pb-4">
        <div>
          <h1 className="text-3xl font-black uppercase">{titel}</h1>
          <p className="font-mono text-sm text-muted-foreground">Riory Werkbonnen · {vorm === "schema" ? "stroomschema's" : "uitgebreide versie"} · versie {HANDLEIDING_VERSIE}</p>
        </div>
        <img src={logo.url} alt="Riory" className="h-14 w-auto" />
      </header>

      <section className="mb-6 break-inside-avoid">
        <h2 className="mb-2 bg-primary px-3 py-2 text-lg font-black uppercase text-primary-foreground">Inhoud</h2>
        <ol className="columns-1 list-decimal pl-6 text-sm sm:columns-2">
          {lijst.map((p) => <li key={p.id}>{p.titel}</li>)}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">Legende: volle rand = stap · stippellijn met ◆ = keuze, volg de tak die past · pijl = volgende stap.</p>
      </section>

      <div className="space-y-4">
        {lijst.map((p) => <ProcessFlow key={p.id} proces={p} uitgebreid={vorm === "uitgebreid"} />)}
      </div>

      <footer className="mt-8 border-t pt-2 font-mono text-xs text-muted-foreground">Riory BV · Natveld 47, 3740 Bilzen · info@riory.be</footer>
    </div>
  );
}
