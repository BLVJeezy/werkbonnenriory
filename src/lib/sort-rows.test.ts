import { describe, expect, it } from "vitest";
import { sortRows } from "./sort-rows";

describe("sortRows", () => {
  it("sorteert getallen en houdt lege waarden onderaan", () => {
    const r = [{ v: 2 }, { v: null }, { v: 10 }, { v: 1 }];
    expect(sortRows(r, (x) => x.v, "asc").map((x) => x.v)).toEqual([1, 2, 10, null]);
    expect(sortRows(r, (x) => x.v, "desc").map((x) => x.v)).toEqual([10, 2, 1, null]);
  });
  it("sorteert factuurnummers natuurlijk", () => {
    const r = ["2026-10", "2026-9", "2026-100"].map((v) => ({ v }));
    expect(sortRows(r, (x) => x.v, "asc").map((x) => x.v)).toEqual(["2026-9", "2026-10", "2026-100"]);
  });
});
