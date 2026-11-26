import { addDays } from "@/lib/invoice";

export const MIN_CUSTOMER_PAYMENT_TERM_DAYS = 0;
export const MAX_CUSTOMER_PAYMENT_TERM_DAYS = 60;
export const FALLBACK_GLOBAL_PAYMENT_DAYS = 14;

export type ParsedPaymentTerm =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

export type CustomerPaymentTermPatchResult =
  | { ok: true; patch: { payment_term_days?: number | null } }
  | { ok: false; error: string };

/** Only admins may supply a term while creating a customer; blank stays unset. */
export function buildCustomerPaymentTermInsertPatch(isAdmin: boolean, input: unknown): CustomerPaymentTermPatchResult {
  if (!isAdmin) return { ok: true, patch: {} };
  const parsed = parseCustomerPaymentTermDays(input);
  if (!parsed.ok) return parsed;
  return { ok: true, patch: parsed.value === null ? {} : { payment_term_days: parsed.value } };
}

/**
 * Builds only a genuine admin term change. Non-admin edits and unchanged admin
 * edits omit the column entirely, preserving the stored value and compatibility
 * with databases where the optional column is not deployed yet.
 */
export function buildCustomerPaymentTermUpdatePatch(input: {
  isAdmin: boolean;
  value: unknown;
  currentValue: unknown;
  hasCurrentColumn: boolean;
}): CustomerPaymentTermPatchResult {
  if (!input.isAdmin) return { ok: true, patch: {} };
  const parsed = parseCustomerPaymentTermDays(input.value);
  if (!parsed.ok) return parsed;
  const currentValue = input.hasCurrentColumn ? input.currentValue : null;
  if (parsed.value === currentValue) return { ok: true, patch: {} };
  return { ok: true, patch: { payment_term_days: parsed.value } };
}

/**
 * Validates an optional customer payment term in calendar days (0–60).
 * Empty / null / undefined means "use the existing global default".
 */
export function parseCustomerPaymentTermDays(input: unknown): ParsedPaymentTerm {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return { ok: true, value: null };
    if (!/^-?\d+$/.test(trimmed)) {
      return { ok: false, error: "Betalingstermijn moet een geheel aantal dagen tussen 0 en 60 zijn." };
    }
    const n = Number(trimmed);
    if (!Number.isSafeInteger(n) || n < MIN_CUSTOMER_PAYMENT_TERM_DAYS || n > MAX_CUSTOMER_PAYMENT_TERM_DAYS) {
      return { ok: false, error: "Betalingstermijn moet tussen 0 en 60 kalenderdagen liggen." };
    }
    return { ok: true, value: n };
  }
  if (typeof input === "number") {
    if (!Number.isInteger(input) || input < MIN_CUSTOMER_PAYMENT_TERM_DAYS || input > MAX_CUSTOMER_PAYMENT_TERM_DAYS) {
      return { ok: false, error: "Betalingstermijn moet een geheel aantal kalenderdagen tussen 0 en 60 zijn." };
    }
    return { ok: true, value: input };
  }
  return { ok: false, error: "Ongeldige betalingstermijn." };
}

/**
 * Safely extracts a valid customer payment term (0–60) from a customer row.
 * Backward-safe when the column is not yet present in the database schema.
 */
export function resolveCustomerPaymentTermFromRow(row: Record<string, unknown> | null | undefined): number | null {
  if (!row || !("payment_term_days" in row)) return null;
  const parsed = parseCustomerPaymentTermDays(row["payment_term_days"]);
  return parsed.ok ? parsed.value : null;
}

export function normalizeGlobalPaymentDays(globalPaymentDays: number | null | undefined): number {
  if (typeof globalPaymentDays === "number" && Number.isInteger(globalPaymentDays) && globalPaymentDays >= 0) {
    return globalPaymentDays;
  }
  return FALLBACK_GLOBAL_PAYMENT_DAYS;
}

export type InvoicePaymentTermInput = {
  kind?: "factuur" | "creditnota" | string | null | undefined;
  /** Separately agreed authoritative term (e.g. explicit contract/document term), if present. */
  explicitTermDays?: number | null | undefined;
  /** Customer-specific term from a reliably linked customer ID (null for ad-hoc / unlinked buyers). */
  customerPaymentTermDays?: number | null | undefined;
  /** Existing global default from settings.payment_days (today 14). */
  globalPaymentDays?: number | null | undefined;
};

/**
 * Resolves the payment term in calendar days for a newly issued sales invoice.
 * Credit notes never use customer payment terms.
 */
export function resolveInvoicePaymentTermDays(input: InvoicePaymentTermInput): number {
  const globalDays = normalizeGlobalPaymentDays(input.globalPaymentDays);
  if (input.kind === "creditnota") return globalDays;

  const explicit = parseCustomerPaymentTermDays(input.explicitTermDays);
  if (explicit.ok && explicit.value !== null) return explicit.value;

  const customer = parseCustomerPaymentTermDays(input.customerPaymentTermDays);
  if (customer.ok && customer.value !== null) return customer.value;

  return globalDays;
}

/**
 * Computes the ISO due_date (YYYY-MM-DD) for a newly issued invoice.
 * 0 days yields the invoice issue date itself.
 */
export function computeInvoiceDueDate(issueDate: string, input: InvoicePaymentTermInput): string {
  return addDays(issueDate, resolveInvoicePaymentTermDays(input));
}