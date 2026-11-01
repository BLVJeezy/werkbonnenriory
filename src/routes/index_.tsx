import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/index_")({
  head: () => ({
    meta: [
      { title: "Start — Riory Werkbonnen" },
      { name: "description", content: "Startpagina van de Riory takenadministratie." },
      { property: "og:title", content: "Start — Riory Werkbonnen" },
      { property: "og:description", content: "Ga naar de takenadministratie van Riory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => { throw redirect({ to: "/werkbonnen", replace: true }); },
});