import { describe, expect, it } from "vitest";
import { fetchAll, fetchAllParallel } from "./fetch-all";

const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
const page = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null });

describe("bloksgewijs ophalen", () => {
  it("fetchAllParallel haalt alle blokken op in de juiste volgorde", async () => {
    const out = await fetchAllParallel(page, 1000, 4);
    expect(out.length).toBe(2500);
    expect(out.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
  it("fetchAllParallel stopt bij een kort blok", async () => {
    const out = await fetchAllParallel(page, 5000, 4);
    expect(out.length).toBe(2500);
  });
  it("fetchAll geeft dezelfde regels als fetchAllParallel", async () => {
    expect(await fetchAll(page)).toEqual(await fetchAllParallel(page, 1000, 8));
  });
});
