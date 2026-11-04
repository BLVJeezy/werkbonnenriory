import { expect, it } from "vitest";
import { dueQuoteReminder, quoteReminderText } from "./quote-reminders";

const sent = "2026-11-01T09:00:00Z";
const at = (d: string) => new Date(d);
const q = (o: Partial<{ status: string; reminder_stage: number }> = {}) => ({ status: "verzonden", sent_at: sent, reminder_stage: 0, ...o });

it("eerste herinnering na 7 dagen, niet ervoor", () => {
  expect(dueQuoteReminder(q(), at("2026-11-08T08:00:00Z"))).toBeNull();
  expect(dueQuoteReminder(q(), at("2026-11-08T09:00:00Z"))).toBe(1);
});

it("tweede herinnering na 10 dagen, pas na de eerste", () => {
  expect(dueQuoteReminder(q({ reminder_stage: 1 }), at("2026-11-10T09:00:00Z"))).toBeNull();
  expect(dueQuoteReminder(q({ reminder_stage: 1 }), at("2026-11-11T09:00:00Z"))).toBe(2);
  expect(dueQuoteReminder(q(), at("2026-11-12T09:00:00Z"))).toBe(1);
});

it("geen herinnering na twee stappen, of bij ondertekende/concept-offerte", () => {
  expect(dueQuoteReminder(q({ reminder_stage: 2 }), at("2026-11-30T09:00:00Z"))).toBeNull();
  expect(dueQuoteReminder(q({ status: "akkoord" }), at("2026-11-30T09:00:00Z"))).toBeNull();
  expect(dueQuoteReminder(q({ status: "concept" }), at("2026-11-30T09:00:00Z"))).toBeNull();
});

it("tweede herinnering vermeldt de geldigheid", () => {
  expect(quoteReminderText({ stage: 2, number: "OFF-1", customerName: "Jan", link: "https://x", validUntil: "2026-12-01" })).toContain("geldig tot 1 december 2026");
});
