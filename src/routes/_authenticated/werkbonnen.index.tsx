import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/werkbonnen/")({
  validateSearch: (s: Record<string, unknown>): { dag?: string } => typeof s["dag"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["dag"]) ? { dag: s["dag"] } : {},
  beforeLoad: ({ search }) => { throw redirect({ to: "/kalender", search, replace: true }); },
});
