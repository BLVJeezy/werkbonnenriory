import { describe, expect, it } from "vitest";
import { describeSalaryAdvances, parseSalaryAdvances } from "./salary-advances";

describe("voorschotten", () => {
  it("leest 10e 500 en 20e 500", () => {
    expect(parseSalaryAdvances("10e 500, 20e 500")).toEqual([{ day: 10, amount: 500 }, { day: 20, amount: 500 }]);
    expect(parseSalaryAdvances("20: 500; 10: 500")).toEqual([{ day: 10, amount: 500 }, { day: 20, amount: 500 }]);
  });
  it("weigert dag 32", () => {
    expect(() => parseSalaryAdvances("32: 500")).toThrow();
  });
  it("afrekening op de 1e", () => {
    expect(describeSalaryAdvances([{ day: 10, amount: 500 }, { day: 20, amount: 500 }], 1)).toContain("op de 1e van de volgende maand");
  });
});
