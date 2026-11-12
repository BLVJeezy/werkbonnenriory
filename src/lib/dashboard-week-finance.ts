import { statements, trialBalance, type PostedLine } from "./boekhouding";
import { dashboardWeeks } from "./dashboard-period";
import { r2 } from "./finance";

export function journalWeekRows(lines: PostedLine[], from: string, to: string) {
  return dashboardWeeks(from, to).map(week => {
    const st = statements(trialBalance(lines.filter(l => l.entry_date >= week.from && l.entry_date <= week.to), week.from, week.to));
    return { ...week, revenue: st.opbrengsten, costs: r2(st.kosten + st.belastingen), profit: st.resultaat };
  });
}