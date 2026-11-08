/** Quote source tasks remain stored, but no longer belong to the task list. */
export function taskListRows<T extends { status: string; quote_pending?: boolean; not_needed?: boolean }>(rows: T[]): T[] {
  return rows.filter(row => row.status !== 'offerte' && !row.quote_pending && !row.not_needed);
}

export function activeTaskRows<T extends { status: string; quote_pending?: boolean }>(rows: T[]): T[] {
  return taskListRows(rows).filter(row => row.status !== 'afgetekend');
}

export function completedWorkOrderRows<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter(row => row.status === 'afgetekend');
}

export function newTaskRows<T extends { status: string; scheduled_date: string | null; quote_pending?: boolean }>(rows: T[]): T[] {
  return taskListRows(rows).filter(row => row.status !== 'afgetekend' && !row.scheduled_date);
}

export function plannedTaskRows<T extends { status: string; scheduled_date: string | null; quote_pending?: boolean }>(rows: T[]): T[] {
  return taskListRows(rows).filter(row => row.status !== 'afgetekend' && Boolean(row.scheduled_date));
}

/** Tasks labelled "Eerste klant" stay pinned to the top; the rest keeps its existing order. */
export function pinFirstCustomer<T extends { first_customer?: boolean | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.first_customer ?? false) - Number(a.first_customer ?? false));
}