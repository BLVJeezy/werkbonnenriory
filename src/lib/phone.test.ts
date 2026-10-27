import { describe, expect, it } from "vitest";
import { callTargets } from "./phone";

describe("callTargets", () => {
  it("toont beide bij verschillende nummers", () => {
    expect(callTargets("0470 11 22 33", "0489 99 88 77")).toEqual({ customer: "0470112233", contact: "0489998877" });
  });
  it("laat contactpersoon weg bij hetzelfde nummer, ook in andere notatie", () => {
    expect(callTargets("0470 11 22 33", "+32 470 11 22 33")).toEqual({ customer: "0470112233", contact: null });
  });
  it("toont contactpersoon zonder klantnummer", () => {
    expect(callTargets(null, "0489998877")).toEqual({ customer: null, contact: "0489998877" });
  });
});
