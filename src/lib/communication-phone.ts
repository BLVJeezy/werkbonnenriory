import { parseContacts } from "@/lib/customer-contacts";

export type CallDirection = "inbound" | "outbound";

export type PhoneMatchStatus = "matched" | "ambiguous" | "unmatched";

export type PhoneUnmatchedReason =
  | "withheld"
  | "invalid"
  | "syndicus_excluded"
  | "no_match";

export type CustomerPhoneRecord = {
  id: string;
  name: string;
  phone?: string | null;
  contacts?: unknown;
  customer_category?: string | null;
  syndicus_id?: string | null;
  syndicus_company?: string | null;
  syndicus?: string | null;
  syndicus_phone?: string | null;
};

export type PhoneMatchCandidate = {
  customerId: string;
  customerName: string;
  matchedSources: string[];
};

export type PhoneMatchResult =
  | {
      status: "matched";
      e164: string;
      customerId: string;
      customerName: string;
      candidates: PhoneMatchCandidate[];
    }
  | {
      status: "ambiguous";
      e164: string;
      candidates: PhoneMatchCandidate[];
    }
  | {
      status: "unmatched";
      e164: string | null;
      reason: PhoneUnmatchedReason;
      candidates: [];
    };

const WITHHELD_TOKENS = new Set([
  "anonymous",
  "anoniem",
  "withheld",
  "private",
  "prive",
  "privé",
  "unknown",
  "onbekend",
  "afgeschermd",
  "blocked",
  "restricted",
  "unavailable",
  "geennummer",
  "hidden",
]);

export function isWithheldPhone(raw: string | null | undefined): boolean {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return true;
  const token = trimmed.toLowerCase().replace(/[^a-z\u00e0-\u00ff]/g, "");
  return token.length > 0 && WITHHELD_TOKENS.has(token);
}

/**
 * Normalizes Belgian local numbers (04xx / 0xx) and +32/0032 to E.164 (+32...),
 * and retains other valid international numbers (including +31 / 0031) as distinct E.164.
 * Returns null for withheld, empty, or invalid numbers.
 */
export function normalizePhoneToE164(raw: string | null | undefined): string | null {
  if (isWithheldPhone(raw)) return null;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  // Reject strings containing unexpected letters (e.g. "ext 12" or garbage)
  if (/[a-zA-Z]/.test(trimmed)) return null;

  // Remove trunk "(0)" notation right after country code, e.g. "+32 (0)470 12 34 56"
  const withoutTrunk = trimmed.replace(/^(\+|00)(\d{1,3})\s*\(0\)\s*/, "$1$2");
  const compact = withoutTrunk.replace(/[\s\-./()]/g, "");

  if (!compact) return null;

  let e164: string | null = null;

  if (compact.startsWith("+")) {
    const digits = compact.slice(1);
    if (/^[1-9]\d{7,14}$/.test(digits)) {
      e164 = `+${digits}`;
    }
  } else if (compact.startsWith("00")) {
    const digits = compact.slice(2);
    if (/^[1-9]\d{7,14}$/.test(digits)) {
      e164 = `+${digits}`;
    }
  } else if (/^0[1-9]\d{7,8}$/.test(compact)) {
    // Belgian national format: 9 digits (landline 0xx) or 10 digits (mobile 04xx)
    e164 = `+32${compact.slice(1)}`;
  }

  if (!e164) return null;

  // Validate Belgian E.164 length: +32 followed by 8 (landline) or 9 (mobile) digits
  if (e164.startsWith("+32")) {
    const national = e164.slice(3);
    if (!/^[1-9]\d{7,8}$/.test(national)) return null;
  }

  return e164;
}

/** Resolves the customer-facing counterpart phone based on call direction. */
export function resolveCounterpartPhone(input: {
  direction: CallDirection;
  callerPhone?: string | null;
  calledPhone?: string | null;
}): string | null {
  const raw = input.direction === "inbound" ? input.callerPhone : input.calledPhone;
  return raw ? raw.trim() : null;
}

function isVmeCustomer(c: CustomerPhoneRecord): boolean {
  return (
    c.customer_category === "vme" ||
    Boolean(c.syndicus_id) ||
    Boolean(c.syndicus_company?.trim()) ||
    Boolean(c.syndicus?.trim())
  );
}

export function buildSyndicusPhoneSet(
  customers: readonly CustomerPhoneRecord[],
  syndicusDirectoryPhones: readonly (string | null | undefined)[] = [],
): Set<string> {
  const set = new Set<string>();
  for (const raw of syndicusDirectoryPhones) {
    const norm = normalizePhoneToE164(raw);
    if (norm) set.add(norm);
  }
  for (const c of customers) {
    const norm = normalizePhoneToE164(c.syndicus_phone);
    if (norm) set.add(norm);
  }
  return set;
}

/**
 * Extracts deduplicated operational E.164 phone numbers for one customer.
 * Excludes syndicus-wide numbers for VME customers so they never auto-assign to a VME.
 */
export function extractCustomerOperationalPhones(
  customer: CustomerPhoneRecord,
  syndicusWidePhones: ReadonlySet<string>,
): Map<string, string[]> {
  const byPhone = new Map<string, string[]>();
  const vme = isVmeCustomer(customer);

  const add = (raw: string | null | undefined, source: string) => {
    const e164 = normalizePhoneToE164(raw);
    if (!e164) return;
    if (vme && syndicusWidePhones.has(e164)) return;
    const existing = byPhone.get(e164);
    if (!existing) {
      byPhone.set(e164, [source]);
    } else if (!existing.includes(source)) {
      existing.push(source);
    }
  };

  add(customer.phone, "phone");

  for (const contact of parseContacts(customer.contacts)) {
    const role = (contact.role ?? "").toLowerCase();
    if (vme && role.includes("syndic")) continue;
    add(contact.phone, contact.name ? `contact:${contact.name}` : "contact");
  }

  return byPhone;
}

/**
 * Matches a call counterpart phone against existing customers.
 * Never auto-assigns on withheld, invalid, syndicus-wide VME numbers, no match, or >1 distinct customer.
 */
export function matchCustomerByPhone(
  input: {
    direction: CallDirection;
    callerPhone?: string | null;
    calledPhone?: string | null;
  },
  customers: readonly CustomerPhoneRecord[],
  syndicusDirectoryPhones: readonly (string | null | undefined)[] = [],
): PhoneMatchResult {
  const raw = resolveCounterpartPhone(input);
  if (isWithheldPhone(raw)) {
    return { status: "unmatched", e164: null, reason: "withheld", candidates: [] };
  }

  const e164 = normalizePhoneToE164(raw);
  if (!e164) {
    return { status: "unmatched", e164: null, reason: "invalid", candidates: [] };
  }

  const syndicusWidePhones = buildSyndicusPhoneSet(customers, syndicusDirectoryPhones);
  const candidates: PhoneMatchCandidate[] = [];

  for (const customer of customers) {
    const phones = extractCustomerOperationalPhones(customer, syndicusWidePhones);
    const matchedSources = phones.get(e164);
    if (matchedSources && matchedSources.length > 0) {
      candidates.push({
        customerId: customer.id,
        customerName: customer.name,
        matchedSources,
      });
    }
  }

  if (candidates.length === 1) {
    const only = candidates[0]!;
    return {
      status: "matched",
      e164,
      customerId: only.customerId,
      customerName: only.customerName,
      candidates,
    };
  }

  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      e164,
      candidates,
    };
  }

  if (syndicusWidePhones.has(e164)) {
    return { status: "unmatched", e164, reason: "syndicus_excluded", candidates: [] };
  }

  return { status: "unmatched", e164, reason: "no_match", candidates: [] };
}

/**
 * Resolves the target customer for saving a recording.
 * - Ambiguous numbers NEVER auto-select, even if openCustomerId is one of the candidates.
 * - Unique matches to a different customer require explicit confirmation.
 */
export function resolveCustomerSelectionForSave(input: {
  openCustomerId: string;
  phoneMatch: PhoneMatchResult | null;
  explicitCustomerId: string;
}): { ok: true; customerId: string } | { ok: false; error: string } {
  const explicit = input.explicitCustomerId.trim();

  if (input.phoneMatch?.status === "ambiguous") {
    if (!explicit) {
      return { ok: false, error: "Kies eerst expliciet de juiste klant voor dit gedeelde nummer." };
    }
    if (!input.phoneMatch.candidates.some((c) => c.customerId === explicit)) {
      return { ok: false, error: "Gekozen klant staat niet bij de kandidaten voor dit nummer." };
    }
    return { ok: true, customerId: explicit };
  }

  if (
    input.phoneMatch?.status === "matched" &&
    input.phoneMatch.customerId !== input.openCustomerId
  ) {
    if (explicit !== input.phoneMatch.customerId && explicit !== input.openCustomerId) {
      return {
        ok: false,
        error: `Bevestig eerst expliciet of je wilt bewaren bij ${input.phoneMatch.customerName} of bij de geopende klant.`,
      };
    }
    return { ok: true, customerId: explicit };
  }

  return { ok: true, customerId: input.openCustomerId };
}