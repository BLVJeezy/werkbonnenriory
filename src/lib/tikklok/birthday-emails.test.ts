import { describe, expect, it } from "vitest";
import { birthdayEmailContent, birthdayRecipients } from "./birthday-emails.server";

describe("birthdayRecipients", () => {
  const employees = [
    { id: "a", name: "Thibo", active: true },
    { id: "b", name: "Femke", active: true },
    { id: "c", name: "Ex-medewerker", active: false },
  ];

  it("stuurt enkel naar actieve medewerkers die vandaag jarig zijn met een e-mailadres", () => {
    const profiles = [
      { employee_id: "a", email: "thibo@example.com", birth_date: "2001-10-22" },
      { employee_id: "b", email: "femke@example.com", birth_date: "2003-03-05" },
      { employee_id: "c", email: "ex@example.com", birth_date: "1999-10-22" },
      { employee_id: "a", email: null, birth_date: "2001-10-22" },
      { employee_id: "a", email: "zonder-verjaardag@example.com", birth_date: null },
    ];
    const result = birthdayRecipients(employees, profiles, "2026-10-22");
    expect(result).toEqual([
      { employee_id: "a", name: "Thibo", email: "thibo@example.com" },
    ]);
  });

  it("maakt een gepersonaliseerde Nederlandse verjaardagsmail", () => {
    const { subject, html } = birthdayEmailContent("Thibo");
    expect(subject).toBe("Gelukkige verjaardag, Thibo!");
    expect(html).toContain("Beste Thibo");
    expect(html).toContain("Riory-team");
  });
});
