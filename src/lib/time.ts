export type TimeEntry = { started_at: string; ended_at: string | null };

export function activeTimeEntry(entries: TimeEntry[]): TimeEntry | undefined {
  return entries.find((entry) => entry.ended_at === null);
}

export function totalSeconds(entries: TimeEntry[], now: number): number {
  return entries.reduce((sum, e) => {
    const end = e.ended_at ? new Date(e.ended_at).getTime() : now;
    return sum + Math.max(0, Math.floor((end - new Date(e.started_at).getTime()) / 1000));
  }, 0);
}

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
