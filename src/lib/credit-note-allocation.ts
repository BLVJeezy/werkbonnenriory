export interface CustomerIdentityLike {
  name?: string | null;
  vatNumber?: string | null;
}

export interface CreditNoteSummary {
  id: string;
  number: string;
  kind: string;
  total: number;
  paid_amount: number;
  credit_for: string | null;
  issue_date: string;
  customer: CustomerIdentityLike | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeVatNumber(vat: string | null | undefined): string {
  return (vat ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeCustomerName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Controleert of twee facturen bij dezelfde juridische klant horen (btw-nummer eerst, anders genormaliseerde naam). */
export function sameLegalCustomer(a: CustomerIdentityLike | null | undefined, b: CustomerIdentityLike | null | undefined): boolean {
  const vatA = normalizeVatNumber(a?.vatNumber);
  const vatB = normalizeVatNumber(b?.vatNumber);
  if (vatA && vatB) return vatA === vatB;
  const nameA = normalizeCustomerName(a?.name);
  const nameB = normalizeCustomerName(b?.name);
  if (!nameA || !nameB) return false;
  return nameA === nameB;
}

export interface AutoAllocationResult {
  creditOpenBefore: number;
  originOpenBefore: number;
  allocateAmount: number;
  surplusCustomerCredit: number;
  originOpenAfter: number;
  status: "settled" | "partial_credit" | "customer_credit";
}

/** Berekent hoeveel van een creditnota automatisch verrekend wordt op de oorsprongsfactuur en hoeveel openstaand klanttegoed overblijft. */
export function computeAutoAllocation(creditTotal: number, creditPaid: number, originTotal: number, originPaid: number): AutoAllocationResult {
  const creditOpenBefore = r2(Math.max(0, Math.abs(creditTotal) - Math.abs(creditPaid)));
  const originOpenBefore = r2(Math.max(0, originTotal - originPaid));
  const allocateAmount = r2(Math.min(creditOpenBefore, originOpenBefore));
  const surplusCustomerCredit = r2(Math.max(0, creditOpenBefore - allocateAmount));
  const originOpenAfter = r2(Math.max(0, originOpenBefore - allocateAmount));
  const status: AutoAllocationResult["status"] =
    allocateAmount <= 0.005 && surplusCustomerCredit > 0.005
      ? "customer_credit"
      : surplusCustomerCredit > 0.005
        ? "partial_credit"
        : "settled";
  return { creditOpenBefore, originOpenBefore, allocateAmount, surplusCustomerCredit, originOpenAfter, status };
}

export function validateManualCreditAllocation(input: {
  creditOpen: number;
  invoiceOpen: number;
  requestedAmount: number;
  creditCustomer: CustomerIdentityLike | null | undefined;
  invoiceCustomer: CustomerIdentityLike | null | undefined;
  isOriginInvoice?: boolean;
}): string | null {
  const amt = r2(input.requestedAmount);
  if (!(amt > 0)) return "Bedrag moet groter dan 0 zijn";
  if (input.creditOpen <= 0.005) return "Deze creditnota heeft geen openstaand tegoed meer";
  if (input.invoiceOpen <= 0.005) return "De gekozen factuur is al volledig betaald";
  if (!input.isOriginInvoice && !sameLegalCustomer(input.creditCustomer, input.invoiceCustomer)) {
    return "Een klanttegoed mag alleen verrekend worden met een factuur van dezelfde klant";
  }
  if (amt > input.creditOpen + 0.005) return `Bedrag is hoger dan het openstaand klanttegoed (€${input.creditOpen.toFixed(2)})`;
  if (amt > input.invoiceOpen + 0.005) return `Bedrag is hoger dan het openstaand saldo van de factuur (€${input.invoiceOpen.toFixed(2)})`;
  return null;
}

/** Filtert openstaande verkoopcreditnota's die nog niet volledig verrekend of terugbetaald zijn (= openstaand klanttegoed). */
export function unallocatedCustomerCredits<T extends CreditNoteSummary>(invoices: T[]): Array<T & { openCredit: number }> {
  return invoices
    .filter((i) => i.kind === "creditnota")
    .map((i) => ({ ...i, openCredit: r2(Math.max(0, Math.abs(Number(i.total)) - Math.abs(Number(i.paid_amount ?? 0)))) }))
    .filter((i) => i.openCredit > 0.005);
}