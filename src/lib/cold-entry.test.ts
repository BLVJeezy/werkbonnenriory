import { beforeEach, expect, it } from "vitest";
import { clearAppEntry, isRestoredWorkOrder, noteAppEntry } from "./cold-entry";

beforeEach(() => {
  // noteAppEntry onthoudt de eerste URL, dus elke test begint met een vers module-jaar.
  vi.resetModules();
});

it("treats a cold open of the page it loaded as a restore", async () => {
  const { clearAppEntry, isRestoredWorkOrder, noteAppEntry } = await import("./cold-entry");
  noteAppEntry("/werkbonnen/09ddfc7f-a4ff-405e-aed6-898927d0aa5e");
  expect(isRestoredWorkOrder("/werkbonnen/09ddfc7f-a4ff-405e-aed6-898927d0aa5e")).toBe(true);
});

it("ignores a deliberate click to another work order", async () => {
  const { isRestoredWorkOrder, noteAppEntry } = await import("./cold-entry");
  noteAppEntry("/werkbonnen/09ddfc7f-a4ff-405e-aed6-898927d0aa5e");
  expect(isRestoredWorkOrder("/werkbonnen/11111111-1111-4111-8111-111111111111")).toBe(false);
});

it("stops counting once the restore has been handled", async () => {
  const { clearAppEntry, isRestoredWorkOrder, noteAppEntry } = await import("./cold-entry");
  noteAppEntry("/werkbonnen/09ddfc7f-a4ff-405e-aed6-898927d0aa5e");
  clearAppEntry();
  expect(isRestoredWorkOrder("/werkbonnen/09ddfc7f-a4ff-405e-aed6-898927d0aa5e")).toBe(false);
});

it("accepts the same page with a trailing slash", async () => {
  const { isRestoredWorkOrder, noteAppEntry } = await import("./cold-entry");
  noteAppEntry("/werkbonnen/09ddfc7f-a4ff-405e-aed6-898927d0aa5e/");
  expect(isRestoredWorkOrder("/werkbonnen/09ddfc7f-a4ff-405e-aed6-898927d0aa5e")).toBe(true);
});
