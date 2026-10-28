/** Quote source tasks remain stored, but no longer belong to the task list. */
export function taskListRows<T extends { status: string; quote_pending?: boolean }>(rows: T[]): T[] {
  return rows.filter(row => row.status !== 'offerte' && !row.quote_pending);
}

export function newTaskRows<T extends { status: string; scheduled_date: string | null; quote_pending?: boolean }>(rows: T[]): T[] {
  return taskListRows(rows).filter(row => row.status !== 'afgetekend' && !row.scheduled_date);
}

export function plannedTaskRows<T extends { status: string; scheduled_date: string | null; quote_pending?: boolean }>(rows: T[]): T[] {
  return taskListRows(rows).filter(row => row.status !== 'afgetekend' && Boolean(row.scheduled_date));
}