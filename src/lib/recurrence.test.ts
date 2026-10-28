import { describe, expect, it } from "vitest";
import { addInterval, occurrencesUntil, nthWeekdayOfMonth, repeatLabel } from "./recurrence";

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

describe("n-de weekdag van de maand", () => {
  // november 2026: maandagen vallen op 2, 9, 16, 23, 30
  it("eerste maandag van november 2026", () => expect(nthWeekdayOfMonth(2026, 11, 1, 0)).toBe("2026-11-02"));
  it("derde vrijdag van november 2026", () => expect(nthWeekdayOfMonth(2026, 11, 3, 4)).toBe("2026-11-20"));
  it("laatste zondag van november 2026", () => expect(nthWeekdayOfMonth(2026, 11, 5, 6)).toBe("2026-11-29"));
  it("laatste maandag van februari 2027", () => expect(nthWeekdayOfMonth(2027, 2, 5, 0)).toBe("2027-02-22"));
  it("volgende eerste maandag van de maand", () => expect(addInterval("2026-11-02", 1, "maand", 1, 0)).toBe("2026-12-07"));
  it("om de 3 maanden op de tweede dinsdag", () => expect(addInterval("2026-11-10", 3, "maand", 2, 1)).toBe("2027-02-09"));
  it("jaarlijks op de eerste maandag van de maand", () => expect(addInterval("2026-11-02", 1, "jaar", 1, 0)).toBe("2027-11-01"));
  it("plant opeenvolgende eerste maandagen tot de horizon", () =>
    expect(occurrencesUntil("2026-11-02", 1, "maand", "2027-02-28", null, 1, 0)).toEqual({
      dates: ["2026-11-02", "2026-12-07", "2027-01-04", "2027-02-01"],
      next: "2027-03-01",
    }));
  it("label voor eerste maandag van de maand", () => expect(repeatLabel(1, "maand", 1, 0)).toBe("Elke eerste maandag van de maand"));
  it("label voor vaste datum blijft ongewijzigd", () => expect(repeatLabel(1, "maand")).toBe("Maandelijks"));
});
