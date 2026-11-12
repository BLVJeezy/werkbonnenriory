import { addDays, format, getISOWeek, parseISO, startOfISOWeek } from "date-fns";

/** Calendar boundaries in the company's timezone, independent of the device timezone. */
export function dashboardToday(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" });
}

export function lastClosedMonth(today = dashboardToday()) {
  const first = `${today.slice(0, 7)}-01`;
  const end = new Date(`${first}T12:00:00Z`);
  end.setUTCDate(0);
  const to = end.toISOString().slice(0, 10);
  return { from: `${to.slice(0, 7)}-01`, to };
}

/** Never allow stale UI state or programmatic input to include the running month. */
export function closedDashboardRange(from: string, to: string, today = dashboardToday()) {
  const closed = lastClosedMonth(today);
  const end = to && to < closed.to ? to : closed.to;
  return { from: from && from <= end ? from : `${end.slice(0, 7)}-01`, to: end };
}

export function weekRange(day: string) {
  const monday = startOfISOWeek(parseISO(day));
  return { from: format(monday, "yyyy-MM-dd"), to: format(addDays(monday, 6), "yyyy-MM-dd") };
}

export function lastClosedWeek(today = dashboardToday()) {
  return weekRange(format(addDays(startOfISOWeek(parseISO(today)), -1), "yyyy-MM-dd"));
}

export function closedWeekRange(from: string, to: string, today = dashboardToday()) {
  const closed = lastClosedWeek(today);
  const end = to && to < closed.to ? weekRange(to).to : closed.to;
  return { from: from && weekRange(from).from <= end ? weekRange(from).from : weekRange(end).from, to: end };
}

export function dashboardWeeks(from: string, to: string) {
  const weeks = [];
  for (let day = from; day <= to; day = format(addDays(parseISO(day), 7), "yyyy-MM-dd")) {
    const range = weekRange(day);
    if (range.from < from || range.to > to) continue;
    weeks.push({ ...range, key: range.from, label: `W${getISOWeek(parseISO(day))}`, period: `${format(parseISO(range.from), "dd/MM/yyyy")} – ${format(parseISO(range.to), "dd/MM/yyyy")}` });
  }
  return weeks;
}