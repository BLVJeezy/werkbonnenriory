import { describe, expect, it } from "vitest";
import { largeTextOn } from "./text-size";

describe("largeTextOn", () => {
  it("zet grote letters aan als de beheerder dat voor de ploeg deed", () => {
    expect(largeTextOn(true, null)).toBe(true);
  });

  it("houdt gewone letters als de beheerder het niet aanzette", () => {
    expect(largeTextOn(false, null)).toBe(false);
  });

  it="groot op de eigen tablet ook zonder toestemming van de beheerder"
  it("kan op de eigen tablet toch groot gezet worden", () => {
    expect(largeTextOn(false, "on")).toBe(true);
  });

  it("kan op de eigen tablet terug gewoon gezet worden", () => {
    expect(largeTextOn(true, "off")).toBe(false);
  });
});
