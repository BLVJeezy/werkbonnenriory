import { describe, expect, it } from "vitest";
import { closedDashboardRange, dashboardToday, lastClosedMonth } from "./dashboard-period";

describe("afgesloten dashboardperiodes", () => {
  it("toont in november standaard de volledige oktobermaand", () => {
    expect(lastClosedMonth("2026-11-12")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("houdt de lopende maand buiten gekozen omzet- en productperiodes", () => {
    expect(closedDashboardRange("2026-01-01", "2026-12-31", "2026-11-12"))
      .toEqual({ from: "2026-01-01", to: "2026-10-31" });
  });
  it("herstelt een periode volledig in de toekomst naar de laatste afgesloten maand", () => {
    expect(closedDashboardRange("2027-01-01", "2027-12-31", "2026-11-12"))
      .toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("behoudt een historische gekozen periode", () => {
    expect(closedDashboardRange("2025-06-15", "2025-09-30", "2026-11-12"))
      .toEqual({ from: "2025-06-15", to: "2025-09-30" });
  });
  it("rolt in januari terug naar december van het vorige jaar", () => {
    expect(lastClosedMonth("2027-01-01")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("neemt een schrikkeldag mee en sluit ook op de laatste dag de lopende maand uit", () => {
    expect(lastClosedMonth("2024-03-31")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
  it("gebruikt Belgische middernacht bij een maandwissel", () => {
    expect(dashboardToday(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
    expect(lastClosedMonth(dashboardToday(new Date("2026-10-31T22:30:00Z"))).to).toBe("2026-09-30");
  });
});