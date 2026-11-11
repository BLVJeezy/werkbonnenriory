import { describe, expect, it } from "vitest";
import { showOnderwegSms } from "./onderweg-sms";

describe("showOnderwegSms", () => {
  it("open taak krijgt de SMS-knop op de kaart, vóór openen", () => {
    expect(showOnderwegSms("nieuw")).toBe(true);
    expect(showOnderwegSms("toegewezen")).toBe(true);
  });
  it("afgetekende werkbon krijgt geen SMS-knop", () => {
    expect(showOnderwegSms("afgetekend")).toBe(false);
  });
  it("taak zonder status krijgt de knop", () => {
    expect(showOnderwegSms(null)).toBe(true);
    expect(showOnderwegSms(undefined)).toBe(true);
  });
});
