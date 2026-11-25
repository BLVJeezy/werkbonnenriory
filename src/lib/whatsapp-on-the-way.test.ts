import { describe, expect, it, vi } from "vitest";
import {
  WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
  buildStaticWhatsAppTemplatePayload,
  evaluateWhatsAppSendEligibility,
  maskE164Phone,
} from "@/lib/whatsapp-on-the-way";
import {
  dispatchWhatsAppOnTheWay,
  type WhatsAppCloudConfig,
} from "@/lib/whatsapp-on-the-way.server";

const ENABLED_MOCK_CFG: WhatsAppCloudConfig = {
  enabled: true,
  phoneNumberId: "100000000000001",
  apiVersion: "v25.0",
  accessToken: "mock-token-never-real",
  templateName: "riory_onderweg_v1",
  templateLanguage: "nl",
};

describe("WhatsApp 'We zijn onderweg' eligibility & recipient rules", () => {
  it("allows assigned technician and admin on active work order with granted consent", () => {
    const techOk = evaluateWhatsAppSendEligibility({
      roles: ["technician"],
      actorTechnicianId: "tech-1",
      workOrderTechnicianId: "tech-1",
      workOrderStatus: "toegewezen",
      workOrderPhone: "0470 12 34 56",
      consentStatus: "granted",
    });
    expect(techOk).toEqual({
      ok: true,
      e164: "+32470123456",
      masked: maskE164Phone("+32470123456"),
    });

    const adminOk = evaluateWhatsAppSendEligibility({
      roles: ["admin"],
      actorTechnicianId: null,
      workOrderTechnicianId: "tech-1",
      workOrderStatus: "toegewezen",
      workOrderPhone: "+31 6 1234 5678",
      consentStatus: "granted",
    });
    expect(adminOk).toEqual({
      ok: true,
      e164: "+31612345678",
      masked: "+31 •••••• 78",
    });
  });

  it("denies unassigned work order, wrong technician, marketing, and customer portal roles", () => {
    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["technician"],
        actorTechnicianId: "tech-1",
        workOrderTechnicianId: null,
        workOrderStatus: "nieuw",
        workOrderPhone: "0470 12 34 56",
        consentStatus: "granted",
      }),
    ).toEqual({ ok: false, reason: "unassigned" });

    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["technician"],
        actorTechnicianId: "tech-2",
        workOrderTechnicianId: "tech-1",
        workOrderStatus: "toegewezen",
        workOrderPhone: "0470 12 34 56",
        consentStatus: "granted",
      }),
    ).toEqual({ ok: false, reason: "unauthorized" });

    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["customer"],
        actorTechnicianId: null,
        workOrderTechnicianId: "tech-1",
        workOrderStatus: "toegewezen",
        workOrderPhone: "0470 12 34 56",
        consentStatus: "granted",
      }),
    ).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("rejects terminal work orders, missing/ambiguous phone, and missing/withdrawn consent", () => {
    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["technician"],
        actorTechnicianId: "tech-1",
        workOrderTechnicianId: "tech-1",
        workOrderStatus: "afgetekend",
        workOrderPhone: "0470 12 34 56",
        consentStatus: "granted",
      }),
    ).toEqual({ ok: false, reason: "terminal_work_order" });

    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["technician"],
        actorTechnicianId: "tech-1",
        workOrderTechnicianId: "tech-1",
        workOrderStatus: "toegewezen",
        workOrderPhone: null,
        customerPhone: null,
        consentStatus: "granted",
      }),
    ).toEqual({ ok: false, reason: "missing_phone" });

    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["technician"],
        actorTechnicianId: "tech-1",
        workOrderTechnicianId: "tech-1",
        workOrderStatus: "toegewezen",
        workOrderPhone: null,
        customerPhone: "0470 11 11 11",
        customerContacts: [{ name: "B", phone: "0470 22 22 22" }],
        consentStatus: "granted",
      }),
    ).toEqual({ ok: false, reason: "ambiguous_phone" });

    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["technician"],
        actorTechnicianId: "tech-1",
        workOrderTechnicianId: "tech-1",
        workOrderStatus: "toegewezen",
        workOrderPhone: "0470 12 34 56",
        consentStatus: "missing",
      }),
    ).toEqual({ ok: false, reason: "missing_consent" });

    expect(
      evaluateWhatsAppSendEligibility({
        roles: ["technician"],
        actorTechnicianId: "tech-1",
        workOrderTechnicianId: "tech-1",
        workOrderStatus: "toegewezen",
        workOrderPhone: "0470 12 34 56",
        consentStatus: "withdrawn",
      }),
    ).toEqual({ ok: false, reason: "withdrawn_consent" });
  });

  it("builds a static utility template payload with no PII parameters or free text", () => {
    expect(WHATSAPP_ON_THE_WAY_DRAFT_TEXT).toBe(
      "Dag, de technieker van Riory is onderweg voor uw afspraak.",
    );
    const payload = buildStaticWhatsAppTemplatePayload({
      recipientE164: "+32470123456",
      templateName: "riory_onderweg_v1",
      templateLanguage: "nl",
    });
    expect(payload).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "32470123456",
      type: "template",
      template: {
        name: "riory_onderweg_v1",
        language: { code: "nl" },
      },
    });
    expect("components" in payload.template).toBe(false);
  });
});

describe("WhatsApp Cloud API server adapter (mock transport only)", () => {
  it("fails closed when disabled and makes zero outbound calls", async () => {
    const transport = vi.fn();
    const res = await dispatchWhatsAppOnTheWay({
      recipientE164: "+32470123456",
      config: { ...ENABLED_MOCK_CFG, enabled: false },
      transport,
    });
    expect(res.outcome).toBe("disabled");
    expect(transport).not.toHaveBeenCalled();
  });

  it("returns accepted with providerMessageId on 200 and uncertain without retry on network error", async () => {
    const okTransport = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.mock123" }] }),
    }));
    const accepted = await dispatchWhatsAppOnTheWay({
      recipientE164: "+32470123456",
      config: ENABLED_MOCK_CFG,
      transport: okTransport,
    });
    expect(accepted).toEqual({ outcome: "accepted", providerMessageId: "wamid.mock123" });
    expect(okTransport).toHaveBeenCalledTimes(1);

    const errTransport = vi.fn(async () => {
      throw new Error("timeout");
    });
    const uncertain = await dispatchWhatsAppOnTheWay({
      recipientE164: "+32470123456",
      config: ENABLED_MOCK_CFG,
      transport: errTransport,
    });
    expect(uncertain.outcome).toBe("uncertain");
    expect(errTransport).toHaveBeenCalledTimes(1); // no automatic retry
  });
});