import { describe, expect, it } from "vitest";
import { filterChoices } from "./choice-search";

describe("choice search", () => {
  it("doorzoekt namen, adres en klantnummer zonder de nieuwste-eerst volgorde te veranderen", () => {
    const choices = [
      { value: "new", label: "001475 — Péeters — Kerkstraat 12 — Bilzen", search: "3740" },
      { value: "old", label: "Jan Peeters — Kerkstraat 14 — Bilzen", search: "3740" },
    ];
    expect(filterChoices(choices, "PEETERS 3740").map(c => c.value)).toEqual(["new", "old"]);
    expect(filterChoices(choices, "001475 12").map(c => c.value)).toEqual(["new"]);
    expect(filterChoices(choices, "onbestaand")).toEqual([]);
  });
  it("vindt offerteproducten via de officiële omschrijving of ploegalias", () => {
    const choices = [{ value: "clean", label: "Volledige dieptereiniging regenputten", search: "Put kuisen — reinigen en ontsmetten" }];
    expect(filterChoices(choices, "regenputten").map(c => c.value)).toEqual(["clean"]);
    expect(filterChoices(choices, "put kuisen").map(c => c.value)).toEqual(["clean"]);
  });
});