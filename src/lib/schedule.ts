export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Crews see open tasks planned for today or tomorrow; unplanned tasks are listed separately. */
export function crewBuckets<T extends { scheduled_date: string | null; sort_order?: number }>(input: T[], now = new Date()) {
  const rows = [...input].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const today = isoDay(now);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = isoDay(t);
  return {
    today: rows.filter((r) => r.scheduled_date === today),
    tomorrow: rows.filter((r) => r.scheduled_date === tomorrow),
    unplanned: rows.filter((r) => !r.scheduled_date),
  };
}
