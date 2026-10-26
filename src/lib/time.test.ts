import { describe, expect, it } from "vitest";
import { formatDuration, totalSeconds } from "./time";

describe("tijdsregistratie", () => {
  it("telt afgesloten en lopende blokken op", () => {
    const now = new Date("2026-10-26T12:00:00Z").getTime();
    const s = totalSeconds(
      [
        { started_at: "2026-10-26T08:00:00Z", ended_at: "2026-10-26T09:30:00Z" },
        { started_at: "2026-10-26T11:45:00Z", ended_at: null },
      ],
      now,
    );
    expect(s).toBe(105 * 60);
    expect(formatDuration(s)).toBe("1:45:00");
  });
});
