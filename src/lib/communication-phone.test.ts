import { describe, expect, it } from "vitest";
import {
  matchCustomerByPhone,
  normalizePhoneToE164,
  type CustomerPhoneRecord,
} from "@/lib/communication-phone";

const SYNTHETIC_CUSTOMERS: CustomerPhoneRecord[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Klant Alfa BV",
    phone: "0470 12 34 56",
    contacts: [
      { name: "Jan", phone: "+32 470 12 34 56", role: "zaakvoerder" }, // duplicate of main phone
      { name: "Piet", phone: "011/22.33.44", role: "werfleider" },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Klant Beta NL",
    phone: "+31 6 1234 5678",
    contacts: [],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Gedeelde Klant A",
    phone: "0499 88 77 66",
    contacts: [],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Gedeelde Klant B",
    phone: "0032 499 88 77 66",
    contacts: [],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "VME Residentie Test",
    customer_category: "vme",
    syndicus_id: "99999999-9999-4999-8999-999999999999",
    phone: "089 55 44 33", // syndicus-wide number copied onto VME
    syndicus_phone: "+32 89 55 44 33",
    contacts: [
      { name: "Syndicus Balie", phone: "089 55 44 33", role: "syndicus" },
      { name: "Conciërge", phone: "0471 99 88 77", role: "conciërge" },
    ],
  },
];

describe("normalizePhoneToE164", () => {
  it("normalizes Belgian local, +32, 0032, and (0) trunk numbers to the same E.164", () => {
    expect(normalizePhoneToE164("0470 12 34 56")).toBe("+32470123456");
    expect(normalizePhoneToE164("+32 470 12 34 56")).toBe("+32470123456");
    expect(normalizePhoneToE164("0032 470 12 34 56")).toBe("+32470123456");
    expect(normalizePhoneToE164("+32 (0)470/12.34.56")).toBe("+32470123456");
    expect(normalizePhoneToE164("011/22.33.44")).toBe("+3211223344");
  });

  it("retains other valid international numbers including +31 / 0031 as distinct", () => {
    expect(normalizePhoneToE164("+31 6 1234 5678")).toBe("+31612345678");
    expect(normalizePhoneToE164("0031 (0)6 1234 5678")).toBe("+31612345678");
    expect(normalizePhoneToE164("+33 1 42 68 53 00")).toBe("+33142685300");
  });

  it("returns null for withheld, empty, or invalid numbers", () => {
    expect(normalizePhoneToE164("anonymous")).toBeNull();
    expect(normalizePhoneToE164("Onbekend")).toBeNull();
    expect(normalizePhoneToE164("withheld")).toBeNull();
    expect(normalizePhoneToE164("123")).toBeNull();
    expect(normalizePhoneToE164("0470 12 34 ext 9")).toBeNull();
    expect(normalizePhoneToE164("")).toBeNull();
  });
});

describe("matchCustomerByPhone", () => {
  it("deduplicates repeated numbers for one customer and matches uniquely", () => {
    const res = matchCustomerByPhone(
      { direction: "inbound", callerPhone: "0032 470 12 34 56" },
      SYNTHETIC_CUSTOMERS,
    );
    expect(res.status).toBe("matched");
    if (res.status === "matched") {
      expect(res.customerId).toBe("11111111-1111-4111-8111-111111111111");
      expect(res.e164).toBe("+32470123456");
    }
  });

  it("uses calledParty for outbound calls and matches Dutch +31 numbers", () => {
    const res = matchCustomerByPhone(
      { direction: "outbound", callerPhone: "0470 12 34 56", calledPhone: "0031 6 1234 5678" },
      SYNTHETIC_CUSTOMERS,
    );
    expect(res.status).toBe("matched");
    if (res.status === "matched") {
      expect(res.customerId).toBe("22222222-2222-4222-8222-222222222222");
      expect(res.e164).toBe("+31612345678");
    }
  });

  it("marks shared numbers across distinct customers as ambiguous and never auto-assigns", () => {
    const res = matchCustomerByPhone(
      { direction: "inbound", callerPhone: "+32 499 88 77 66" },
      SYNTHETIC_CUSTOMERS,
    );
    expect(res.status).toBe("ambiguous");
    if (res.status === "ambiguous") {
      expect(res.candidates).toHaveLength(2);
    }
  });

  it("excludes syndicus-wide numbers from automatic VME assignment but allows VME concierge", () => {
    const synRes = matchCustomerByPhone(
      { direction: "inbound", callerPhone: "089 55 44 33" },
      SYNTHETIC_CUSTOMERS,
      ["+32 89 55 44 33"],
    );
    expect(synRes).toEqual({
      status: "unmatched",
      e164: "+3289554433",
      reason: "syndicus_excluded",
      candidates: [],
    });

    const conciergeRes = matchCustomerByPhone(
      { direction: "inbound", callerPhone: "+32 471 99 88 77" },
      SYNTHETIC_CUSTOMERS,
      ["+32 89 55 44 33"],
    );
    expect(conciergeRes.status).toBe("matched");
    if (conciergeRes.status === "matched") {
      expect(conciergeRes.customerId).toBe("55555555-5555-4555-8555-555555555555");
    }
  });

  it("never auto-assigns on withheld, invalid, or unmatched numbers", () => {
    expect(
      matchCustomerByPhone({ direction: "inbound", callerPhone: "Private" }, SYNTHETIC_CUSTOMERS),
    ).toEqual({ status: "unmatched", e164: null, reason: "withheld", candidates: [] });

    expect(
      matchCustomerByPhone({ direction: "inbound", callerPhone: "abc-99" }, SYNTHETIC_CUSTOMERS),
    ).toEqual({ status: "unmatched", e164: null, reason: "invalid", candidates: [] });

    expect(
      matchCustomerByPhone({ direction: "inbound", callerPhone: "0475 00 00 01" }, SYNTHETIC_CUSTOMERS),
    ).toEqual({ status: "unmatched", e164: "+32475000001", reason: "no_match", candidates: [] });
  });
});