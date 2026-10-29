import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/crashtest")({
  component: Crashtest,
});

function Crashtest() {
  throw new Error("tijdelijke testcrash");
}
