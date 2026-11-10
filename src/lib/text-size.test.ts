import { describe, expect, it } from "vitest";
import { largeTextOn } from "./text-size";

describe("largeTextOn", () => {
  it("zet grote letters aan als de beheerder dat voor de ploeg deed", () => {
    expect(largeTextOn(true, null)).toBe(true);
  });

  it("houdt gewone letters als de beheerder het niet aanzette", () => {
    expect(largeTextOn(false, null)).toBe(false);
  });

  it("kan op de eigen tablet toch groot gezet worden", () => {
    expect(largeTextOn(false, "on")).toBe(true);
  });

  it("kan op de eigen tablet terug gewoon gezet worden", () => {
    expect(largeTextOn(true, "off")).toBe(false);
  });
});

import { textSizeStatus } from "./text-size";
describe("textSizeStatus", () => {
  it("legt uit dat de ploeginstelling van kracht is", () => {
    expect(textSizeStatus(true, null)).toContain("ploeg");
  });
  it("meldt dat de ploeginstelling bewaard blijft na lokaal uitzetten", () => {
    expect(textSizeStatus(true, "off")).toContain("blijft bewaard");
  });
  it("toont normaal zonder keuzes", () => {
    expect(textSizeStatus(false, null)).toBe("Normale tekstgrootte.");
  });
});
