import { describe, expect, it } from "vitest";
import { textOn } from "./crew-color";

describe("textOn", () => {
  it("uses white text on dark crew colours", () => {
    expect(textOn("#1d4ed8")).toBe("#ffffff");
  });
  it("uses dark text on light crew colours", () => {
    expect(textOn("#fde047")).toBe("#111111");
  });
});
