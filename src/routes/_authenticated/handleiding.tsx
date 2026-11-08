import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { handleiding, HANDLEIDING_VERSIE } from "@/lib/handleiding";
import logo from "@/assets/riory-mail-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/handleiding")({
  head: () => ({
    meta: [
      { title: "Handleiding — Riory Werkbonnen" },
      { name: "description", content: "Uitleg voor beheerders en ploegen van Riory Werkbonnen, als PDF te downloaden." },
      { property: "og:title", content: "Handleiding — Riory Werkbonnen" },
      { property: "og:description", content: "Uitleg voor beheerders en ploegen, als PDF te downloaden." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HandleidingPage,
});

function HandleidingPage() {
  const send = async () => {
    const url = `${window.location.origin}/handleiding`;
    const text = `Handleiding Riory Werkbonnen: ${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Handleiding Riory Werkbonnen", text, url }); return; } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
      }
    }
    window.location.href = `mailto:?subject=${encodeURIComponent("Handleiding Riory Werkbonnen")}&body=${encodeURIComponent(text + "\n\nOpen de link en kies 'Download PDF' om ze te bewaren.")}`;
  };

  return (
    <div className="handleiding-print mx-auto max-w-3xl p-4">
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Button onClick={() => window.print()}>Download PDF</Button>
        <Button variant="outline" onClick={send}>Verzenden</Button>
        <p className="w-full text-sm text-muted-foreground">Bij 'Download PDF' kies je in het venster "Opslaan als PDF".</p>
      </div>
      <header className="mb-6 flex items-center justify-between border-b-4 border-primary pb-4">
        <div>
          <h1 className="text-3xl font-black uppercase">Handleiding</h1>
          <p className="font-mono text-sm text-muted-foreground">Riory Werkbonnen · versie {HANDLEIDING_VERSIE}</p>
        </div>
        <img src={logo.url} alt="Riory" className="h-14 w-auto" />
      </header>
      {handleiding.map((deel, i) => (
        <section key={deel.titel} className={i > 0 ? "handleiding-deel mt-8" : "mt-2"}>
          <h2 className="mb-1 bg-primary px-3 py-2 text-xl font-black uppercase text-primary-foreground">{deel.titel}</h2>
          <p className="mb-4 mt-2">{deel.intro}</p>
          {deel.secties.map((s) => (
            <div key={s.titel} className="mb-4 break-inside-avoid">
              <h3 className="mb-1 border-l-4 border-primary pl-2 font-bold">{s.titel}</h3>
              <ul className="list-disc space-y-1 pl-6 text-sm">
                {s.punten.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <footer className="mt-8 border-t pt-2 font-mono text-xs text-muted-foreground">Riory BV · Natveld 47, 3740 Bilzen · info@riory.be</footer>
    </div>
  );
}
