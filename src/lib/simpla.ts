export type SimplaCustomer = { customerId?: number; customerName?: string; customerEmail?: string; customerEmailBilling?: string; isBlocked?: boolean };
const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
export function matchSimplaCustomer(rows: SimplaCustomer[], name: string, email: string | null) {
  const active = rows.filter((r) => !r.isBlocked);
  const byEmail = email ? active.filter((r) => [r.customerEmail, r.customerEmailBilling].some((v) => normalize(v) === normalize(email))) : [];
  const matches = byEmail.length ? byEmail : active.filter((r) => normalize(r.customerName) === normalize(name));
  return matches.length === 1 ? matches[0] : null;
}