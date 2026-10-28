import { Timer } from "lucide-react";
import { activeTimeEntry, type TimeEntry } from "@/lib/time";

export function RunningTask({ entries, crewName }: { entries: TimeEntry[]; crewName?: string | null | undefined }) {
  const running = activeTimeEntry(entries);
  if (!running) return null;
  return (
    <span role="status" className="my-1 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded border-2 border-running bg-running px-2 py-2 text-sm font-bold text-running-foreground">
      <Timer className="h-5 w-5 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
      <span className="uppercase">Ploeg aan het werk</span>
      {crewName && <span className="w-full break-words">{crewName}</span>}
      <span className="w-full font-mono text-xs">Gestart om {new Date(running.started_at).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })}</span>
    </span>
  );
}