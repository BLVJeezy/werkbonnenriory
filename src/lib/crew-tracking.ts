export interface CrewAssignmentRow {
  id: string;
  employee_id: string;
  technician_id: string;
  started_at: string;
  ended_at: string | null;
}

export interface ClockEntryRow {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
}

export interface WorkedCrewSession {
  key: string;
  employee_id: string;
  technician_id: string;
  started_at: string;
  ended_at: string | null;
  active: boolean;
  durationMs: number;
}

/**
 * Intersects crew assignments with tikklok clock-in/out entries.
 * Time when the employee was not clocked in is never counted as worked in a crew.
 */
export function intersectCrewAssignmentsWithClock(
  assignments: CrewAssignmentRow[],
  timeEntries: ClockEntryRow[],
  nowMs = Date.now(),
): WorkedCrewSession[] {
  const entriesByEmp = new Map<string, ClockEntryRow[]>();
  for (const entry of timeEntries) {
    const list = entriesByEmp.get(entry.employee_id);
    if (list) list.push(entry);
    else entriesByEmp.set(entry.employee_id, [entry]);
  }

  const sessions: WorkedCrewSession[] = [];
  for (const a of assignments) {
    const entries = entriesByEmp.get(a.employee_id);
    if (!entries || entries.length === 0) continue;

    const aStart = new Date(a.started_at).getTime();
    const aEnd = a.ended_at ? new Date(a.ended_at).getTime() : nowMs;
    if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || aEnd <= aStart) continue;

    for (const e of entries) {
      const cStart = new Date(e.clock_in).getTime();
      const cEnd = e.clock_out ? new Date(e.clock_out).getTime() : nowMs;
      if (!Number.isFinite(cStart) || !Number.isFinite(cEnd) || cEnd <= cStart) continue;

      const start = Math.max(aStart, cStart);
      const end = Math.min(aEnd, cEnd);
      if (end <= start) continue;

      const active = a.ended_at === null && e.clock_out === null;
      sessions.push({
        key: `${a.id}:${e.id}`,
        employee_id: a.employee_id,
        technician_id: a.technician_id,
        started_at: new Date(start).toISOString(),
        ended_at: active ? null : new Date(end).toISOString(),
        active,
        durationMs: end - start,
      });
    }
  }

  sessions.sort((x, y) => new Date(y.started_at).getTime() - new Date(x.started_at).getTime());
  return sessions;
}

export function formatWorkedDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes > 0 ? `${hours} u ${String(minutes).padStart(2, "0")} m` : `${hours} u`;
}