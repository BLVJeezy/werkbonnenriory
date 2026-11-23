import { createFileRoute } from "@tanstack/react-router";
import { FactuurInstellingen } from "@/components/FactuurInstellingen";
import { TarievenBeheer } from "@/components/TarievenBeheer";
import { PloegenBeheer } from "@/components/PloegenBeheer";
import { VestigingenBeheer } from "@/components/VestigingenBeheer";
import { AdminUsers } from "@/components/AdminUsers";
import { useRole } from "@/lib/use-role";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/instellingen")({
  head: () => ({ meta: [{ title: "Instellingen — Riory Werkbonnen" }, { name: "description", content: "Factuurinstellingen, tarieven en ploegen beheren." }, { property: "og:title", content: "Instellingen — Riory Werkbonnen" }, { property: "og:description", content: "Factuurinstellingen, tarieven en ploegen beheren." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Instellingen,
});

function Instellingen() {
  const role = useRole();
  if (role !== "admin") return <p className="text-muted-foreground">Instellingen zijn alleen beschikbaar voor beheerders.</p>;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Instellingen"
        subtitle="Beheer toegang, facturatie, vestigingen, tarieven en ploegen op één plek."
      />

      <Tabs defaultValue="ploegen" className="space-y-5">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="ploegen">Ploegen</TabsTrigger>
          <TabsTrigger value="tarieven">Tarieven</TabsTrigger>
          <TabsTrigger value="factuur">Factuurinstellingen</TabsTrigger>
          <TabsTrigger value="vestigingen">Vestigingen</TabsTrigger>
          <TabsTrigger value="beheerders">Beheerders</TabsTrigger>
        </TabsList>

        <TabsContent value="ploegen" className="rounded-xl border border-border/90 bg-card p-4 shadow-xs sm:p-6">
          <PloegenBeheer />
        </TabsContent>
        <TabsContent value="tarieven" className="rounded-xl border border-border/90 bg-card p-4 shadow-xs sm:p-6">
          <TarievenBeheer />
        </TabsContent>
        <TabsContent value="factuur" className="rounded-xl border border-border/90 bg-card p-4 shadow-xs sm:p-6">
          <FactuurInstellingen />
        </TabsContent>
        <TabsContent value="vestigingen" className="rounded-xl border border-border/90 bg-card p-4 shadow-xs sm:p-6">
          <VestigingenBeheer />
        </TabsContent>
        <TabsContent value="beheerders" className="rounded-xl border border-border/90 bg-card p-4 shadow-xs sm:p-6">
          <AdminUsers />
        </TabsContent>
      </Tabs>
    </div>
  );
}
