import { describe, expect, test } from "vitest";
import { quoteMailText } from "./quote-mail-text";

const line = (optional = false) => ({
  description: "Dieptereiniging regenput",
  quantity: 1,
  unit: "st",
  unitPrice: 100,
  amount: 100,
  optional,
});

const base = {
  number: "OFF-9",
  customerName: "Janssens",
  link: "https://werkbonnenriory.lovable.app/offerte/abc",
};

describe("quoteMailText", () => {
  test("legt de prijswaarschuwing uit wanneer er keuzemogelijkheden zijn", () => {
    const text = quoteMailText({ ...base, lines: [line(), line(true)] });
    expect(text).toContain(
      "De prijs is pas definitief nadat u heeft aangegeven welke mogelijkheden u neemt.",
    );
    expect(text).toContain("https://werkbonnenriory.lovable.app/offerte/abc");
    expect(text.indexOf("pas definitief")).toBeLessThan(text.indexOf("Akkoord?"));
  });

  test("laat de prijswaarschuwing weg zonder keuzemogelijkheden", () => {
    const text = quoteMailText({ ...base, lines: [line()] });
    expect(text).not.toContain("pas definitief");
    expect(text).toContain("In de bijlage vindt u offerte OFF-9.");
    expect(text).toContain("Met vriendelijke groeten,\nRiory");
  });

  test("gebruikt bestekwoordgoed voor verzekeringsdossiers", () => {
    const text = quoteMailText({ ...base, kind: "verzekering", lines: [line(true)] });
    expect(text).toContain("In de bijlage vindt u het bestek voor uw verzekering OFF-9.");
    expect(text).toContain("pas definitief");
  });
});
