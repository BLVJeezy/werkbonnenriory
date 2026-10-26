export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Crews see open tasks planned for today or tomorrow; unplanned tasks are listed separately. */
export function crewBuckets<T extends { scheduled_date: string | null }>(rows: T[], now = new Date()) {
  const today = isoDay(now);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = isoDay(t);
  return {
    today: rows.filter((r) => r.scheduled_date === today),
    tomorrow: rows.filter((r) => r.scheduled_date === tomorrow),
    unplanned: rows.filter((r) => !r.scheduled_date),
  };
}
