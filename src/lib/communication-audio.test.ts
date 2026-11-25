import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  buildCommunicationStoragePath,
  evaluateAudioReadiness,
  isAllowedCommunicationRole,
  validateAudioUploadMeta,
  validateCommunicationOwnership,
  validateExternalAudioUrl,
} from "@/lib/communication-audio";

describe("communication-audio role & readiness controls", () => {
  it("allows only admin role and denies customer, technician, marketing, and empty roles", () => {
    expect(isAllowedCommunicationRole(["admin"])).toBe(true);
    expect(isAllowedCommunicationRole(["technician"])).toBe(false);
    expect(isAllowedCommunicationRole(["marketing"])).toBe(false);
    expect(isAllowedCommunicationRole(["customer"])).toBe(false);
    expect(isAllowedCommunicationRole([])).toBe(false);
  });

  it("fails closed until feature flag, approved retention policy, and schema are all ready", () => {
    const defaultState = evaluateAudioReadiness({
      featureEnabled: false,
      retentionPolicyApproved: false,
      schemaReady: false,
    });
    expect(defaultState.ready).toBe(false);
    expect(defaultState.blockers).toHaveLength(3);

    const noRetention = evaluateAudioReadiness({
      featureEnabled: true,
      retentionPolicyApproved: false,
      schemaReady: true,
    });
    expect(noRetention.ready).toBe(false);

    const allReady = evaluateAudioReadiness({
      featureEnabled: true,
      retentionPolicyApproved: true,
      schemaReady: true,
    });
    expect(allReady.ready).toBe(true);
    expect(allReady.blockers).toHaveLength(0);
  });
});

describe("communication-audio MIME, size, storage path & ownership validation", () => {
  const custA = "11111111-1111-4111-8111-111111111111";
  const custB = "22222222-2222-4222-8222-222222222222";
  const commId = "33333333-3333-4333-8333-333333333333";

  it("accepts allowlisted audio MIME + matching extension within size cap and lawful confirmation", () => {
    const ok = validateAudioUploadMeta({
      fileName: "gesprek.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
      lawfulBasisConfirmed: true,
    });
    expect(ok).toEqual({ ok: true, ext: "mp3", mimeType: "audio/mpeg" });
  });

  it("rejects disallowed MIME, extension mismatch, oversize, or missing lawful confirmation", () => {
    expect(
      validateAudioUploadMeta({
        fileName: "script.html",
        mimeType: "text/html",
        sizeBytes: 100,
        lawfulBasisConfirmed: true,
      }).ok,
    ).toBe(false);

    expect(
      validateAudioUploadMeta({
        fileName: "fake.wav",
        mimeType: "audio/mpeg",
        sizeBytes: 100,
        lawfulBasisConfirmed: true,
      }).ok,
    ).toBe(false);

    expect(
      validateAudioUploadMeta({
        fileName: "te-groot.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: MAX_AUDIO_BYTES + 1,
        lawfulBasisConfirmed: true,
      }).ok,
    ).toBe(false);

    expect(
      validateAudioUploadMeta({
        fileName: "gesprek.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 1024,
        lawfulBasisConfirmed: false,
      }).ok,
    ).toBe(false);
  });

  it("builds private customer-scoped storage paths and rejects traversal", () => {
    expect(buildCommunicationStoragePath(custA, commId, "mp3")).toBe(`${custA}/${commId}.mp3`);
    expect(() => buildCommunicationStoragePath("../other", commId, "mp3")).toThrow();
  });

  it("blocks cross-customer work order or project links", () => {
    expect(
      validateCommunicationOwnership({
        customerId: custA,
        workOrderId: "44444444-4444-4444-8444-444444444444",
        workOrderCustomerId: custA,
      }).ok,
    ).toBe(true);

    expect(
      validateCommunicationOwnership({
        customerId: custA,
        workOrderId: "44444444-4444-4444-8444-444444444444",
        workOrderCustomerId: custB,
      }).ok,
    ).toBe(false);

    expect(
      validateCommunicationOwnership({
        customerId: custA,
        projectId: "55555555-5555-4555-8555-555555555555",
        projectCustomerId: custB,
      }).ok,
    ).toBe(false);
  });

  it("accepts only valid https Telavox links and rejects http/javascript/empty", () => {
    expect(validateExternalAudioUrl("https://app.telavox.se/recordings/abc-123")).toEqual({
      ok: true,
      url: "https://app.telavox.se/recordings/abc-123",
    });
    expect(validateExternalAudioUrl("http://app.telavox.se/recordings/abc").ok).toBe(false);
    expect(validateExternalAudioUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateExternalAudioUrl("").ok).toBe(false);
  });
});