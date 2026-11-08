import { describe, test, expect } from "vitest";
const deepStrictEqual = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected);
const strictEqual = (actual: unknown, expected: unknown) => expect(actual).toBe(expected);
import { planHoursHistory } from "./hours-history";

describe("effective-dated contract hours", () => {
  test("Thibo retains 24 hours before the 36.5-hour change on 12 October", () => {
    const rows = planHoursHistory({ weekly_hours: 24, daily_schedule: null, employment_start_date: "2026-08-31" },
      36.5, null, "2026-10-12", []);
    deepStrictEqual(rows, [
      { weekly_hours: 24, daily_schedule: null, effective_from: "2026-08-31" },
      { weekly_hours: 36.5, daily_schedule: null, effective_from: "2026-10-12" },
    ]);
  });
  test("Femke retains 8 hours before the change to 3 hours", () => {
    const rows = planHoursHistory({ weekly_hours: 8, daily_schedule: null, employment_start_date: "2026-04-16" },
      3, { sat: 3 }, "2026-09-14", []);
    strictEqual(rows[0]?.weekly_hours, 8);
    strictEqual(rows[1]?.weekly_hours, 3);
    strictEqual(rows[1]?.effective_from, "2026-09-14");
  });
  test("existing baseline is not duplicated", () => {
    deepStrictEqual(planHoursHistory({ weekly_hours: 24, daily_schedule: null, employment_start_date: "2026-08-31" },
      36.5, null, "2026-10-12", ["2026-08-31"]), [
      { weekly_hours: 36.5, daily_schedule: null, effective_from: "2026-10-12" },
    ]);
  });
  test("unchanged hours do not add history", () => {
    deepStrictEqual(planHoursHistory({ weekly_hours: 24, daily_schedule: null, employment_start_date: "2026-08-31" },
      24, null, "2026-10-12", []), []);
  });
});