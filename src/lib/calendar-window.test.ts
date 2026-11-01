import { describe, expect, it } from "vitest";
import { calendarWindow } from "./calendar-window";

describe("calendarWindow", () => {
  it("starts exactly one day before today across a month boundary", () => {
    expect(calendarWindow(new Date(2026, 10, 1, 9))[0]).toEqual(new Date(2026, 9, 31));
  });
  it("includes today and seven complete future days", () => {
    const days = calendarWindow(new Date(2026, 10, 1));
    expect(days).toHaveLength(9);
    expect(days[1]).toEqual(new Date(2026, 10, 1));
    expect(days[8]).toEqual(new Date(2026, 10, 8));
  });
  it("advances the default window on the next day", () => {
    expect(calendarWindow(new Date(2026, 10, 2))[0]).toEqual(new Date(2026, 10, 1));
  });
  it("preserves navigation to future and past periods", () => {
    expect(calendarWindow(new Date(2026, 10, 1), 7)[0]).toEqual(new Date(2026, 10, 7));
    expect(calendarWindow(new Date(2026, 10, 1), -7)[0]).toEqual(new Date(2026, 9, 24));
  });
});