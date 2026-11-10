import { createFileRoute, redirect } from "@tanstack/react-router";

// Oude adres van de (verwijderde) ploegvoorraad: stuur door naar Producten per ploeg.
export const Route = createFileRoute("/_authenticated/ploegvoorraad")({
  beforeLoad: () => {
    throw redirect({ to: "/ploegproducten", replace: true });
  },
});
