import { Timer } from "lucide-react";
import { activeTimeEntry, type TimeEntry } from "@/lib/time";

export function RunningTask({ entries }: { entries: TimeEntry[] }) {
  const running = activeTimeEntry(entries);
  if (!running) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-sm font-bold">
      <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
      Bezig sinds {new Date(running.started_at).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })}
    </span>
  );
}