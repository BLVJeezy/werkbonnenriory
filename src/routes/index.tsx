import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Riory Werkbonnen" },
      { name: "description", content: "Werkbonnen uit de afspraakmailbox, toegewezen aan technici." },
      { property: "og:title", content: "Riory Werkbonnen" },
      { property: "og:description", content: "Werkbonnen uit de afspraakmailbox, toegewezen aan technici." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/werkbonnen" });
  },
});
