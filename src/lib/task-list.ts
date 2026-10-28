/** Quote source tasks remain stored, but no longer belong to the task list. */
export function taskListRows<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter(row => row.status !== 'offerte');
}