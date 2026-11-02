import { describe, expect, it } from "vitest";
import { fetchAll } from "./fetch-all";

const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));

describe("bloksgewijs ophalen", () => {
  it("haalt alle blokken op in de juiste volgorde", async () => {
    const out = await fetchAll((from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }));
    expect(out).toEqual(rows);
  });
  it("vraagt niet verder nadat een kort blok kwam", async () => {
    let aanvragen = 0;
    const out = await fetchAll((from, to) => {
      aanvragen++;
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    }, 5000);
    expect(out.length).toBe(2500);
    expect(aanvragen).toBe(1);
  });
  it("geeft een databasefout door in plaats van een half overzicht", async () => {
    await expect(fetchAll(() => Promise.resolve({ data: null, error: new Error("uitgever is weg") }))).rejects.toThrow("uitgever is weg");
  });
});
