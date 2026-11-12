import { describe, expect, it } from "vitest";
import { closedDashboardRange, closedWeekRange, dashboardToday, dashboardWeeks, lastClosedMonth, lastClosedWeek } from "./dashboard-period";

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

describe("voorbije dashboardweken", () => {
  it("laat op donderdag 12 november alleen weken tot zondag 8 november toe", () => {
    expect(lastClosedWeek("2026-11-12")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(closedWeekRange("2026-11-09", "2026-11-15", "2026-11-12"))
      .toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
  it("sluit de huidige week ook op zondag uit en opent haar pas op maandag", () => {
    expect(lastClosedWeek("2026-11-15").to).toBe("2026-11-08");
    expect(lastClosedWeek("2026-11-16").to).toBe("2026-11-15");
  });
  it("maakt historische keuzes volledig van maandag tot zondag", () => {
    expect(closedWeekRange("2026-10-14", "2026-10-22", "2026-11-12"))
      .toEqual({ from: "2026-10-12", to: "2026-10-25" });
  });
  it("behoudt volledige weken over een jaargrens met correcte ISO-weeknummers", () => {
    expect(lastClosedWeek("2027-01-04")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(dashboardWeeks("2026-12-28", "2027-01-10").map(w => [w.label, w.from, w.to]))
      .toEqual([["W53", "2026-12-28", "2027-01-03"], ["W1", "2027-01-04", "2027-01-10"]]);
  });
});