import { describe, expect, it } from "vitest";
import { loginEmail } from "./login";

describe("loginEmail", () => {
  it("turns a crew name into the same internal login, whatever the casing", () => {
    expect(loginEmail("Ploeg Één")).toBe("ploeg-een@ploeg.riory.local");
    expect(loginEmail("  ploeg één ")).toBe("ploeg-een@ploeg.riory.local");
  });
  it("leaves a real email (admin) untouched", () => {
    expect(loginEmail("info@riory.be")).toBe("info@riory.be");
  });
});
