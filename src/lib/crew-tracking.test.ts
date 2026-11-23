import { describe, expect, it } from "vitest";
import { intersectCrewAssignmentsWithClock } from "./crew-tracking";

describe("intersectCrewAssignmentsWithClock", () => {
  it("toont niets wanneer de medewerker niet is ingetikt", () => {
    const sessions = intersectCrewAssignmentsWithClock(
      [{ id: "a1", employee_id: "e1", technician_id: "c1", started_at: "2026-11-23T07:00:00Z", ended_at: "2026-11-23T18:00:00Z" }],
      [],
      Date.parse("2026-11-23T19:00:00Z"),
    );
    expect(sessions).toEqual([]);
  });

  it("telt enkel de overlappende werktijd tijdens een ploegtoewijzing", () => {
    const sessions = intersectCrewAssignmentsWithClock(
      [{ id: "a1", employee_id: "e1", technician_id: "c1", started_at: "2026-11-23T00:00:00Z", ended_at: null }],
      [{ id: "t1", employee_id: "e1", clock_in: "2026-11-23T08:00:00Z", clock_out: "2026-11-23T12:30:00Z" }],
      Date.parse("2026-11-23T17:00:00Z"),
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.started_at).toBe("2026-11-23T08:00:00.000Z");
    expect(sessions[0]?.ended_at).toBe("2026-11-23T12:30:00.000Z");
    expect(sessions[0]?.active).toBe(false);
    expect(sessions[0]?.durationMs).toBe(4.5 * 3600000);
  });

  it("splitst een werkdag bij een ploegwissel zonder uren buiten werktijd", () => {
    const sessions = intersectCrewAssignmentsWithClock(
      [
        { id: "a1", employee_id: "e1", technician_id: "c1", started_at: "2026-11-22T20:00:00Z", ended_at: "2026-11-23T11:00:00Z" },
        { id: "a2", employee_id: "e1", technician_id: "c2", started_at: "2026-11-23T11:00:00Z", ended_at: null },
      ],
      [{ id: "t1", employee_id: "e1", clock_in: "2026-11-23T08:00:00Z", clock_out: "2026-11-23T16:00:00Z" }],
      Date.parse("2026-11-23T18:00:00Z"),
    );
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.technician_id).toBe("c2");
    expect(sessions[0]?.durationMs).toBe(5 * 3600000);
    expect(sessions[1]?.technician_id).toBe("c1");
    expect(sessions[1]?.durationMs).toBe(3 * 3600000);
  });

  it("markeert een sessie alleen als actief wanneer zowel ploeg als tikklok open staan", () => {
    const now = Date.parse("2026-11-23T10:30:00Z");
    const sessions = intersectCrewAssignmentsWithClock(
      [{ id: "a1", employee_id: "e1", technician_id: "c1", started_at: "2026-11-23T07:00:00Z", ended_at: null }],
      [{ id: "t1", employee_id: "e1", clock_in: "2026-11-23T08:00:00Z", clock_out: null }],
      now,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.active).toBe(true);
    expect(sessions[0]?.ended_at).toBeNull();
    expect(sessions[0]?.durationMs).toBe(2.5 * 3600000);
  });
});