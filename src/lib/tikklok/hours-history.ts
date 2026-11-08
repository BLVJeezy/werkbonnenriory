type HoursProfile = {
  weekly_hours: number | string | null;
  daily_schedule: unknown;
  employment_start_date: string | null;
};

type HistoryRow = {
  weekly_hours: number | null;
  daily_schedule: unknown;
  effective_from: string;
};

export function planHoursHistory(
  previous: HoursProfile | null,
  nextHours: number | null,
  nextSchedule: unknown,
  effectiveFrom: string,
  existingDates: string[],
): HistoryRow[] {
  const oldHours = previous?.weekly_hours == null ? null : Number(previous.weekly_hours);
  const oldSchedule = previous?.daily_schedule ?? null;
  if (oldHours === nextHours && JSON.stringify(oldSchedule) === JSON.stringify(nextSchedule ?? null)) return [];
  const rows: HistoryRow[] = [];
  const start = previous?.employment_start_date;
  // A first change must retain the original regime, not just the new one.
  if (oldHours != null && start && start < effectiveFrom && !existingDates.some((date) => date <= start)) {
    rows.push({ weekly_hours: oldHours, daily_schedule: oldSchedule, effective_from: start });
  }
  rows.push({ weekly_hours: nextHours, daily_schedule: nextSchedule ?? null, effective_from: effectiveFrom });
  return rows;
}

/** Called only by authorized server handlers, before updating a profile. */
export async function recordHoursChange(
  client: any,
  employeeId: string,
  adminId: string,
  previous: HoursProfile | null,
  nextHours: number | null,
  nextSchedule: unknown,
  effectiveFrom: string,
) {
  const { data: history, error: readError } = await client.from("tk_employee_hours_history")
    .select("effective_from").eq("employee_id", employeeId);
  if (readError) throw new Error("Urenhistoriek kon niet worden geladen");
  const rows = planHoursHistory(previous, nextHours, nextSchedule, effectiveFrom,
    (history ?? []).map((row: { effective_from: string }) => row.effective_from));
  if (!rows.length) return;
  const { error } = await client.from("tk_employee_hours_history").insert(rows.map((row) => ({
    ...row, employee_id: employeeId, created_by: adminId,
  })));
  if (error) throw new Error("Urenhistoriek opslaan mislukt");
}