import { describe, expect, it } from "vitest";
import { addInterval, occurrencesUntil } from "./recurrence";

describe("terugkerende opdrachten", () => {
  it("om de 6 weken", () => expect(addInterval("2026-10-28", 6, "week")).toBe("2026-12-09"));
  it("per kwartaal", () => expect(addInterval("2026-11-15", 3, "maand")).toBe("2027-02-15"));
  it("om de 2 jaar", () => expect(addInterval("2026-10-28", 2, "jaar")).toBe("2028-10-28"));
  it("maandeinde wordt afgekapt", () => expect(addInterval("2027-01-31", 1, "maand")).toBe("2027-02-28"));
  it("plant tot de horizon en geeft de volgende datum", () =>
    expect(occurrencesUntil("2026-11-01", 1, "week", "2026-11-20")).toEqual({ dates: ["2026-11-01", "2026-11-08", "2026-11-15"], next: "2026-11-22" }));
  it("stopt op de einddatum van het contract", () =>
    expect(occurrencesUntil("2026-11-01", 1, "week", "2026-12-31", "2026-11-10").dates).toEqual(["2026-11-01", "2026-11-08"]));
});
