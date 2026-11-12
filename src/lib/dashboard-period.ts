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