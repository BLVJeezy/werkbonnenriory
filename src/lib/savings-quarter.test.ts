import { describe, expect, it } from "vitest";
import { previousQuarter } from "./savings-quarter";

describe("previousQuarter", () => {
  it("november valt terug op het derde kwartaal", () => {
    expect(previousQuarter("2026-11-01")).toEqual({ label: "2026-Q3", start: "2026-07-01", end: "2026-09-30" });
  });
  it("januari valt terug op het vierde kwartaal van vorig jaar", () => {
    expect(previousQuarter("2027-01-15")).toEqual({ label: "2026-Q4", start: "2026-10-01", end: "2026-12-31" });
  });
});
