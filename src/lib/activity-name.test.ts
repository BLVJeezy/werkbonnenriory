import { expect, it } from "vitest";
import { renameActivity } from "./activity-name";

it("trims the typed name before saving it", () => {
  expect(renameActivity("Herstelling", "  Plaatsen van een raam  ", ["Herstelling"])).toEqual({
    ok: true,
    name: "Plaatsen van een raam",
  });
});

it("refuses to save an empty name", () => {
  expect(renameActivity("Herstelling", "   ", ["Herstelling"])).toEqual({ ok: false, reason: "empty" });
});

it("does not save a name that did not change", () => {
  expect(renameActivity("Herstelling", "Herstelling", ["Herstelling"])).toEqual({
    ok: false,
    reason: "unchanged",
  });
});

it("refuses a name another activity already has, also with other capitalisation", () => {
  expect(renameActivity("Herstelling", "plaatsen van een raam", ["Herstelling", "Plaatsen van een raam"])).toEqual({
    ok: false,
    reason: "duplicate",
  });
});

it("allows capitalising the activity's own name", () => {
  expect(renameActivity("herstelling", "Herstelling", ["herstelling", "Plaatsen van een raam"])).toEqual({
    ok: true,
    name: "Herstelling",
  });
});
