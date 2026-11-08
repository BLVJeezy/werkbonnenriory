import { describe, it, expect } from "vitest";
import { incidentEndDate, incidentSchema } from "./incident-rules";

const base = { id: "00000000-0000-4000-8000-000000000001", employee_id: "00000000-0000-4000-8000-000000000002", incident_type: "late", occurred_on: "2026-11-02", ends_on: "2026-11-02", late_minutes: 15, observation: "", send: false };
describe("vaststellingen", () => {
  it("registreert te laat met concrete minuten", () => {
    expect(incidentSchema.parse(base).late_minutes).toBe(15);
    expect(incidentSchema.safeParse({ ...base, late_minutes: null }).success).toBe(false);
  });
  it("registreert ziekte als periode zonder vertraging", () => {
    expect(incidentSchema.parse({ ...base, incident_type: "sick", ends_on: "2026-11-04", late_minutes: null }).ends_on).toBe("2026-11-04");
    expect(incidentSchema.safeParse({ ...base, incident_type: "sick" }).success).toBe(false);
  });
  it("registreert niet opdagen als één dag zonder vertraging", () => {
    expect(incidentSchema.parse({ ...base, incident_type: "no_show", late_minutes: null }).incident_type).toBe("no_show");
    expect(incidentSchema.safeParse({ ...base, incident_type: "no_show" }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...base, incident_type: "no_show", late_minutes: null, ends_on: "2026-11-03" }).success).toBe(false);
  });
  it("houdt niet opdagen op één dag na een meerdaagse ziekteregistratie", () => {
    const ends_on = incidentEndDate("no_show", "2026-11-02", "2026-11-04");
    expect(ends_on).toBe("2026-11-02");
    expect(incidentSchema.parse({ ...base, incident_type: "no_show", late_minutes: null, ends_on }).ends_on).toBe("2026-11-02");
  });
  it("versturen blijft een expliciete keuze", () => {
    expect(incidentSchema.parse(base).send).toBe(false);
    expect(incidentSchema.parse({ ...base, send: true }).send).toBe(true);
  });
  it("weigert omgekeerde periodes en onbestaande datums", () => {
    expect(incidentSchema.safeParse({ ...base, ends_on: "2026-11-01" }).success).toBe(false);
    expect(incidentSchema.safeParse({ ...base, occurred_on: "2026-02-30", ends_on: "2026-02-30" }).success).toBe(false);
  });
});