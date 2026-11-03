import { expect, it } from "vitest";
import { fitText } from "./pdf-text";

// Monospace-meting: één teken = één eenheid, dus een breedte van n past precies n tekens.
const mono = (line: string) => line.length;

it("zet een lange titel op meerdere regels zodat hij niet in de prijs loopt", () => {
  expect(fitText(mono, "TERUGPLAATSEN TEGELS EN VERHARDING", 10)).toEqual([
    "TERUGPLAATSEN",
    "TEGELS EN",
    "VERHARDING",
  ]);
});

it("breekt een woord dat breder is dan de kolom op in stukken die passen", () => {
  const lines = fitText(mono, "EVENTUELERESERVETEGELS", 7);
  expect(lines).toEqual(["EVENTUE", "LERESER", "VETEGEL", "S"]);
  for (const line of lines) expect(mono(line)).toBeLessThanOrEqual(7);
});

it("laat een titel die in één regel past onaangeroerd", () => {
  expect(fitText(mono, "Dichtmaken sleuf", 20)).toEqual(["Dichtmaken sleuf"]);
});

it("houdt elke regel binnen de beschikbare breedte", () => {
  const lines = fitText(mono, "POST 5 - TERUGPLAATSEN TEGELS EN VERHARDING. (EVENTUELE RESERVETEGELS TE VOORZIEN DOOR KLANT)", 24);
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines) expect(mono(line)).toBeLessThanOrEqual(24);
});
