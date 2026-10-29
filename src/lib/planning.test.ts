import { describe, expect, it } from "vitest";
import { isFullyPlanned } from "./planning";

const base = { scheduled_date: "2026-10-30", technician_id: "t1", activity_id: "a1" };

describe("isFullyPlanned", () => {
  it("is pas volledig als dag, ploeg en activiteit ingevuld zijn", () => {
    expect(isFullyPlanned(base)).toBe(true);
  });

  it("blijft onvolledig zonder dag", () => {
    expect(isFullyPlanned({ ...base, scheduled_date: null })).toBe(false);
  });

  it("blijft onvolledig zonder ploeg", () => {
    expect(isFullyPlanned({ ...base, technician_id: null })).toBe(false);
  });

  it("blijft onvolledig zonder activiteit", () => {
    expect(isFullyPlanned({ ...base, activity_id: null })).toBe(false);
  });
});
