import { describe, expect, it } from "vitest";
import { nextLoanAccounts, reclassifications } from "./loan-schedule";

describe("lening uit aflossingstabel", () => {
  it("volgende rekeningpaar na 173210/423210", () => {
    expect(nextLoanAccounts(["173210", "423200", "423210", "550200"])).toEqual({ long: "173220", short: "423220" });
  });
  it("herklassering per jaareinde voor kapitaal van het volgende jaar", () => {
    expect(reclassifications([{ dueDate: "2026-12-05", capital: 100, interest: 1 }, { dueDate: "2027-01-05", capital: 101, interest: 1 }, { dueDate: "2027-06-05", capital: 102, interest: 1 }])).toEqual([{ year: 2026, amount: 203 }]);
  });
});
