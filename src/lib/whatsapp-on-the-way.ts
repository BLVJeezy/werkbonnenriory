import { normalizePhoneToE164 } from "@/lib/communication-phone";
import { parseContacts } from "@/lib/customer-contacts";

export const WHATSAPP_ON_THE_WAY_TEMPLATE_KEY = "we_zijn_onderweg";
export const WHATSAPP_ON_THE_WAY_DRAFT_TEXT =
  "Dag, de technieker van Riory is onderweg voor uw afspraak.";

export type WhatsAppSendState = "prepared" | "accepted" | "uncertain" | "failed";
export type WhatsAppConsentStatus = "granted" | "withdrawn" | "missing";

const TERMINAL_STATUSES = new Set([
  "afgetekend",
  "gefactureerd",
  "geannuleerd",
  "completed",
  "invoiced",
  "cancelled",
  "done",
]);

export function isWorkOrderTerminal(
  status: string | null | undefined,
  signedAt?: string | null,
): boolean {
  if (signedAt) return true;
  const norm = String(status ?? "").trim().toLowerCase();
  return norm.length > 0 && TERMINAL_STATUSES.has(norm);
}

/** Masks an E.164 phone number for UI display, e.g. +32470123456 -> +32 •••• 56. */
export function maskE164Phone(e164: string): string {
  if (e164.length < 7) return "••••";
  const prefix = e164.slice(0, 3);
  const last2 = e164.slice(-2);
  return `${prefix} •••••• ${last2}`;
}

/**
 * Authorizes only Riory admin or the specific technician assigned to this work order.
 * Rejects unassigned work orders, other technicians, marketing, and customer portal accounts.
 */
export function canActorSendWorkOrderWhatsApp(input: {
  roles: readonly string[];
  actorTechnicianId: string | null;
  workOrderTechnicianId: string | null;
}): { ok: true } | { ok: false; reason: "unauthorized" | "unassigned" } {
  if (!input.workOrderTechnicianId) {
    return { ok: false, reason: "unassigned" };
  }
  if (input.roles.includes("admin")) {
    return { ok: true };
  }
  if (
    input.roles.includes("technician") &&
    input.actorTechnicianId &&
    input.actorTechnicianId === input.workOrderTechnicianId
  ) {
    return { ok: true };
  }
  return { ok: false, reason: "unauthorized" };
}

/**
 * Resolves the single authorized BE/NL E.164 recipient from the work order or customer record.
 * Rejects missing, non-BE/NL, or ambiguous (>1 distinct) numbers.
 */
export function resolveWorkOrderWhatsAppRecipient(input: {
  workOrderPhone?: string | null | undefined;
  customerPhone?: string | null | undefined;
  customerContacts?: unknown;
}):
  | { ok: true; e164: string; masked: string }
  | { ok: false; reason: "missing_phone" | "ambiguous_phone" | "unsupported_country" } {
  const woNorm = normalizePhoneToE164(input.workOrderPhone);
  if (woNorm) {
    if (!woNorm.startsWith("+32") && !woNorm.startsWith("+31")) {
      return { ok: false, reason: "unsupported_country" };
    }
    return { ok: true, e164: woNorm, masked: maskE164Phone(woNorm) };
  }

  const candidates = new Set<string>();
  const custNorm = normalizePhoneToE164(input.customerPhone);
  if (custNorm) candidates.add(custNorm);

  for (const c of parseContacts(input.customerContacts)) {
    const norm = normalizePhoneToE164(c.phone);
    if (norm) candidates.add(norm);
  }

  if (candidates.size === 0) {
    return { ok: false, reason: "missing_phone" };
  }
  if (candidates.size > 1) {
    return { ok: false, reason: "ambiguous_phone" };
  }

  const only = Array.from(candidates)[0]!;
  if (!only.startsWith("+32") && !only.startsWith("+31")) {
    return { ok: false, reason: "unsupported_country" };
  }
  return { ok: true, e164: only, masked: maskE164Phone(only) };
}

export function evaluateWhatsAppSendEligibility(input: {
  roles: readonly string[];
  actorTechnicianId: string | null;
  workOrderTechnicianId: string | null;
  workOrderStatus: string | null | undefined;
  signedAt?: string | null;
  workOrderPhone?: string | null;
  customerPhone?: string | null;
  customerContacts?: unknown;
  consentStatus: WhatsAppConsentStatus;
}):
  | { ok: true; e164: string; masked: string }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "unassigned"
        | "terminal_work_order"
        | "missing_phone"
        | "ambiguous_phone"
        | "unsupported_country"
        | "missing_consent"
        | "withdrawn_consent";
    } {
  const auth = canActorSendWorkOrderWhatsApp({
    roles: input.roles,
    actorTechnicianId: input.actorTechnicianId,
    workOrderTechnicianId: input.workOrderTechnicianId,
  });
  if (!auth.ok) return auth;

  if (isWorkOrderTerminal(input.workOrderStatus, input.signedAt)) {
    return { ok: false, reason: "terminal_work_order" };
  }

  const recipient = resolveWorkOrderWhatsAppRecipient({
    workOrderPhone: input.workOrderPhone,
    customerPhone: input.customerPhone,
    customerContacts: input.customerContacts,
  });
  if (!recipient.ok) return recipient;

  if (input.consentStatus === "withdrawn") {
    return { ok: false, reason: "withdrawn_consent" };
  }
  if (input.consentStatus !== "granted") {
    return { ok: false, reason: "missing_consent" };
  }

  return { ok: true, e164: recipient.e164, masked: recipient.masked };
}

/** Builds the fixed static Meta WhatsApp Cloud API utility template payload (no PII parameters). */
export function buildStaticWhatsAppTemplatePayload(input: {
  recipientE164: string;
  templateName: string;
  templateLanguage: string;
}) {
  const digitsOnly = input.recipientE164.replace(/^\+/, "");
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: digitsOnly,
    type: "template" as const,
    template: {
      name: input.templateName,
      language: { code: input.templateLanguage },
    },
  };
}