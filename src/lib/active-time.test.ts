import { expect, it } from "vitest";
import { activeTimeEntry } from "./time";

it("shows the currently started registration, not earlier stopped work", () => {
  const running = { started_at: "2026-10-27T08:12:00Z", ended_at: null };
  expect(activeTimeEntry([{ started_at: "2026-10-27T07:00:00Z", ended_at: "2026-10-27T08:00:00Z" }, running])).toEqual(running);
});
it("removes the busy indication when time stops", () => {
  expect(activeTimeEntry([{ started_at: "2026-10-27T08:12:00Z", ended_at: "2026-10-27T08:30:00Z" }])).toBeUndefined();
  expect(activeTimeEntry([])).toBeUndefined();
});