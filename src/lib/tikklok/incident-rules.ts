import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Ongeldige datum");

export const incidentSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  incident_type: z.enum(["late", "sick", "no_show"]),
  occurred_on: date,
  ends_on: date,
  late_minutes: z.number().int().min(1).max(1440).nullable(),
  observation: z.string().trim().max(1500),
  send: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.ends_on < v.occurred_on) ctx.addIssue({ code: "custom", message: "Einddatum ligt vóór de startdatum" });
  if (v.incident_type === "late" && (v.late_minutes === null || v.ends_on !== v.occurred_on)) ctx.addIssue({ code: "custom", message: "Vul het aantal minuten te laat in" });
  if (v.incident_type === "sick" && v.late_minutes !== null) ctx.addIssue({ code: "custom", message: "Ziekte heeft geen minuten vertraging" });
  if (v.incident_type === "no_show" && (v.late_minutes !== null || v.ends_on !== v.occurred_on)) ctx.addIssue({ code: "custom", message: "Niet opdagen is één dag zonder minuten vertraging" });
});
export type IncidentInput = z.infer<typeof incidentSchema>;

export function incidentEndDate(kind: IncidentInput["incident_type"], occurredOn: string, sicknessEnd: string) {
  return kind === "sick" ? sicknessEnd : occurredOn;
}

export function incidentToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Brussels" }).format(new Date());
}