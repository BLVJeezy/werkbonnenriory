import { describe, expect, it } from "vitest";
import { isModuleLoadError } from "./module-recovery";

describe("version-change module recovery", () => {
  it("recognizes the Safari lazy route export failure", () => {
    const error = new Error("undefined is not an object (evaluating 'e[t??`default`]')");
    error.stack = "@/assets/lazyRouteComponent-DDObNvQ-.js:1:5058";
    expect(isModuleLoadError(error)).toBe(true);
  });
  it("recognizes missing downloaded modules", () => {
    expect(isModuleLoadError(new Error("Importing a module script failed."))).toBe(true);
  });
  it("does not reload for unrelated missing data", () => {
    expect(isModuleLoadError(new Error("Cannot read properties of undefined (reading 'name')"))).toBe(false);
  });
});