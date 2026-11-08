import { z } from 'zod';

export const migrationPinSchema = z.object({
  employeeId: z.string().uuid(),
  pin: z.string().trim().regex(/^\d{4,8}$/, 'Vul een geldige pincode in'),
});

export function isTikklokSender(mailbox: string | null | undefined) {
  return mailbox?.trim().toLowerCase() === 'info@riory.be';
}

export const migrationSections = [
  ['tk_employees', 'Medewerkers', 5],
  ['tk_time_entries', 'Klokregistraties', 177],
  ['tk_employee_profiles', 'Personeelsfiches', 4],
  ['tk_payroll_runs', 'Loonberekeningen', 13],
  ['tk_employment_contracts', 'Contracten', 1],
  ['tk_employee_documents', 'Documentverwijzingen', 0],
] as const;