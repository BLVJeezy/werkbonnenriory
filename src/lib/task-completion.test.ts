import { expect, it, vi } from "vitest";
import { completeTask } from "./task-completion";

it.each(["aftekenen", "afrekenen"])("returns the crew home after saved %s and mail", async () => {
  const steps: string[] = [];
  await completeTask({ save: async () => { steps.push("saved"); return true; }, mail: async () => { steps.push("mail"); }, afterSaved: () => { steps.push("/werkbonnen"); } });
  expect(steps).toEqual(["saved", "mail", "/werkbonnen"]);
});
it("returns home even if sending fails after completion", async () => {
  const home = vi.fn();
  await expect(completeTask({ save: async () => true, mail: async () => { throw new Error("mail failed"); }, afterSaved: home })).rejects.toThrow("mail failed");
  expect(home).toHaveBeenCalledOnce();
});
it("does not leave the task or send mail when saving fails", async () => {
  const mail = vi.fn(), home = vi.fn();
  expect(await completeTask({ save: async () => false, mail, afterSaved: home })).toBe(false);
  expect(mail).not.toHaveBeenCalled();
  expect(home).not.toHaveBeenCalled();
});