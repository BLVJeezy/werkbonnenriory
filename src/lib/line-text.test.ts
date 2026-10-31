import { expect, it } from "vitest";
import { splitLineText } from "./line-text";

it("leest de productnaam uit de eerste regel en laat de omschrijving eronder staan", () => {
  expect(splitLineText("Dieptereiniging regenput\nPut leeggepompt en met hogedruk gereinigd.")).toEqual({
    title: "Dieptereiniging regenput",
    detail: "Put leeggepompt en met hogedruk gereinigd.",
  });
});

it("laat een regel zonder omschrijving zonder bijvoegsel", () => {
  expect(splitLineText("Buis SML 111 mm")).toEqual({ title: "Buis SML 111 mm", detail: null });
});

it("negeert lege regels rond de omschrijving", () => {
  expect(splitLineText("\n\n Naam \n\n lange\nomschrijving \n\n ")).toEqual({ title: "Naam", detail: "lange\nomschrijving" });
});

it("geeft een lege regel terug als lege naam", () => {
  expect(splitLineText("   \n  ")).toEqual({ title: "", detail: null });
});
