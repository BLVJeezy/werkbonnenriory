import { describe, expect, it } from "vitest";
import { crewBuckets } from "./schedule";

describe("crewBuckets", () => {
  const rows = [
    { id: "a", scheduled_date: "2026-10-26" },
    { id: "b", scheduled_date: "2026-10-27" },
    { id: "c", scheduled_date: "2026-10-28" },
    { id: "d", scheduled_date: "2026-10-25" },
    { id: "e", scheduled_date: null },
  ];
  const b = crewBuckets(rows, new Date(2026, 9, 26, 20));
  it("shows only today and tomorrow", () => {
    expect(b.today.map((r) => r.id)).toEqual(["a"]);
    expect(b.tomorrow.map((r) => r.id)).toEqual(["b"]);
  });
  it("lists unplanned tasks", () => {
    expect(b.unplanned.map((r) => r.id)).toEqual(["e"]);
  });
});
