import { describe, expect, it } from "vitest";
import { filterChoices } from "@/lib/choice-search";
import { materialChoices } from "@/lib/material-options";

const product = (over: Partial<{ id: string; name: string; alias: string | null; description: string; unit: string; price: number }>) => ({
  id: over.id ?? "p1",
  name: over.name ?? "Pomp",
  alias: over.alias ?? null,
  description: over.description ?? "",
  unit: over.unit ?? "stk",
  price: over.price ?? 50,
  admin_only: false,
  photo_paths: [],
  created_at: "2026-01-01",
});

const products = [
  product({ id: "a", name: "Riool pomp", alias: "RP-1", description: "slijtvast", price: 120.5 }),
  product({ id: "b", name: "Kamera inspectie", alias: null, description: "Full HD", price: 0 }),
];

describe("materialChoices", () => {
  it("sorts by alias when present, otherwise by name", () => {
    expect(materialChoices(products, true).map((c) => c.value)).toEqual(["b", "a"]);
  });

  it("finds a product by alias, by name and by description word", () => {
    const choices = materialChoices(products, true);
    expect(filterChoices(choices, "rp-1").map((c) => c.value)).toEqual(["a"]);
    expect(filterChoices(choices, "kamera").map((c) => c.value)).toEqual(["b"]);
    expect(filterChoices(choices, "slijtvast").map((c) => c.value)).toEqual(["a"]);
    expect(filterChoices(choices, "rp slijtvast").map((c) => c.value)).toEqual(["a"]);
  });

  it("ignores accents when searching", () => {
    const choices = materialChoices([product({ id: "c", name: "Céramiek put", alias: null, description: "" })], true);
    expect(filterChoices(choices, "ceramiek").map((c) => c.value)).toEqual(["c"]);
  });

  it("shows the price only when prices are allowed", () => {
    const withPrice = materialChoices([product({ id: "a", price: 120.5 })], true);
    const withoutPrice = materialChoices([product({ id: "a", price: 120.5 })], false);
    expect(withPrice[0]?.label).toContain("€");
    expect(withoutPrice[0]?.label).not.toContain("€");
    expect(withoutPrice[0]?.label).toContain("(stk)");
  });
});
