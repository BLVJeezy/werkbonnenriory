import { createFileRoute } from "@tanstack/react-router";
import { FactuurInstellingen } from "@/components/FactuurInstellingen";
import { TarievenBeheer } from "@/components/TarievenBeheer";
import { PloegenBeheer } from "@/components/PloegenBeheer";
import { VestigingenBeheer } from "@/components/VestigingenBeheer";

export const Route = createFileRoute("/_authenticated/instellingen")({
  head: () => ({ meta: [{ title: "Instellingen — Riory Werkbonnen" }, { name: "description", content: "Factuurinstellingen, tarieven en ploegen beheren." }, { property: "og:title", content: "Instellingen — Riory Werkbonnen" }, { property: "og:description", content: "Factuurinstellingen, tarieven en ploegen beheren." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Instellingen,
});

function Instellingen() {
  return (
    <div className="space-y-10">
      <h1 className="text-3xl font-black uppercase">Instellingen</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-black uppercase">Factuurinstellingen</h2>
        <FactuurInstellingen />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-black uppercase">Vestigingen</h2>
        <VestigingenBeheer />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-black uppercase">Tarieven</h2>
        <TarievenBeheer />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-black uppercase">Ploegen</h2>
        <PloegenBeheer />
      </section>
    </div>
  );
}
