import { describe, expect, it } from "vitest";
import { isReplyMail } from "./reply-mail";
describe("isReplyMail", () => {
  it("slaat antwoorden over", () => {
    expect(isReplyMail("RE: Afspraak ontstopping")).toBe(true);
    expect(isReplyMail("Antw: afspraak")).toBe(true);
    expect(isReplyMail("FW: lek")).toBe(true);
  });
  it("neemt nieuwe mails", () => {
    expect(isReplyMail("Afspraak ontstopping")).toBe(false);
    expect(isReplyMail("Reiniging regenput")).toBe(false);
  });
});
