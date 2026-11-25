import { describe, expect, it, vi } from "vitest";
import {
  WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
  buildStaticWhatsAppTemplatePayload,
  evaluateWhatsAppSendEligibility,
  maskE164Phone,
} from "@/lib/whatsapp-on-the-way";
import {
  dispatchWhatsAppOnTheWay,
  executeGetWorkOrderWhatsAppStatus,
  executeSendWorkOrderWhatsAppOnTheWay,
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
      recipientScope: "customer",
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
      recipientScope: "customer",
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

type MockConsentRow = { customer_id: string; phone_e164: string; status: "granted" | "withdrawn" };

function createMockClients(opts: {
  roles: string[];
  actorTechnicianId: string | null;
  workOrder: {
    id: string;
    customer_id: string | null;
    technician_id: string | null;
    status: string;
    signed_at: string | null;
    phone: string | null;
    use_site_address: boolean;
    site_contact_phone: string | null;
  } | null;
  customer?: { phone: string | null; contacts: unknown } | null;
  consents?: MockConsentRow[];
  consentError?: boolean;
}) {
  const sends: Array<{ id: string; work_order_id: string; template_key: string; status: string }> = [];

  // Ordinary authenticated RLS-scoped client: technicians have NO direct access to consent/send writes
  const scopedClient = {
    rpc: vi.fn(async (fn: string) => ({
      data: fn === "my_technician_id" ? opts.actorTechnicianId : null,
      error: null,
    })),
    from: vi.fn((table: string) => {
      if (table === "customer_whatsapp_consents" || table === "work_order_whatsapp_sends") {
        throw new Error(`Scoped client must not query ${table} directly`);
      }
      return {
        select: () => ({
          eq: (_col: string, _val: string) => {
            if (table === "user_roles") {
              return Promise.resolve({
                data: opts.roles.map((role) => ({ role })),
                error: null,
              });
            }
            return {
              maybeSingle: async () => ({
                data: table === "work_orders" ? opts.workOrder : (opts.customer ?? null),
                error: null,
              }),
            };
          },
        }),
      };
    }),
  };

  const adminFrom = vi.fn((table: string) => {
    if (table === "customer_whatsapp_consents") {
      return {
        select: () => ({
          eq: (_c1: string, custId: string) => ({
            eq: async (_c2: string, phoneE164: string) => {
              if (opts.consentError) return { data: null, error: { message: "db error" } };
              const matched = (opts.consents ?? []).filter(
                (r) => r.customer_id === custId && r.phone_e164 === phoneE164,
              );
              return { data: matched.map((r) => ({ status: r.status })), error: null };
            },
          }),
        }),
      };
    }
    if (table === "work_order_whatsapp_sends") {
      return {
        select: () => ({
          eq: (_c1: string, woId: string) => ({
            eq: (_c2: string, tpl: string) => ({
              maybeSingle: async () => ({
                data: sends.find((s) => s.work_order_id === woId && s.template_key === tpl) ?? null,
                error: null,
              }),
            }),
          }),
        }),
        insert: (row: { work_order_id: string; template_key: string; status: string }) => ({
          select: () => ({
            single: async () => {
              const exists = sends.some(
                (s) => s.work_order_id === row.work_order_id && s.template_key === row.template_key,
              );
              if (exists) return { data: null, error: { code: "23505" } };
              const created = { id: `send-${sends.length + 1}`, ...row };
              sends.push(created);
              return { data: { id: created.id }, error: null };
            },
          }),
        }),
        update: (patch: { status: string }) => ({
          eq: async (_c: string, id: string) => {
            const target = sends.find((s) => s.id === id);
            if (target) target.status = patch.status;
            return { data: null, error: null };
          },
        }),
      };
    }
    throw new Error(`Unexpected admin table: ${table}`);
  });

  const getAdminClient = vi.fn(async () => ({ from: adminFrom }));
  return { scopedClient, getAdminClient, adminFrom, sends };
}

describe("Server-mediated WhatsApp consent & authorization flow", () => {
  it("allows assigned technician with granted exact number without direct consent table access", async () => {
    const { scopedClient, getAdminClient } = createMockClients({
      roles: ["technician"],
      actorTechnicianId: "tech-1",
      workOrder: {
        id: "wo-1",
        customer_id: "cust-1",
        technician_id: "tech-1",
        status: "toegewezen",
        signed_at: null,
        phone: "0470 12 34 56",
        use_site_address: false,
        site_contact_phone: null,
      },
      consents: [{ customer_id: "cust-1", phone_e164: "+32470123456", status: "granted" }],
    });

    const status = await executeGetWorkOrderWhatsAppStatus({
      scopedClient,
      getAdminClient,
      userId: "user-tech-1",
      workOrderId: "wo-1",
      config: ENABLED_MOCK_CFG,
    });
    expect(status.canSend).toBe(true);
    expect(status.maskedRecipient).toBe("+32 •••••• 56");

    const transport = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.exact-1" }] }),
    }));
    const sent = await executeSendWorkOrderWhatsAppOnTheWay({
      scopedClient,
      getAdminClient,
      userId: "user-tech-1",
      workOrderId: "wo-1",
      config: ENABLED_MOCK_CFG,
      transport,
    });
    expect(sent.status).toBe("accepted");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("refuses send when consent exists only for a different number of the same customer", async () => {
    const { scopedClient, getAdminClient } = createMockClients({
      roles: ["technician"],
      actorTechnicianId: "tech-1",
      workOrder: {
        id: "wo-2",
        customer_id: "cust-1",
        technician_id: "tech-1",
        status: "toegewezen",
        signed_at: null,
        phone: "0470 99 88 77",
        use_site_address: false,
        site_contact_phone: null,
      },
      consents: [{ customer_id: "cust-1", phone_e164: "+32470123456", status: "granted" }],
    });

    const transport = vi.fn();
    await expect(
      executeSendWorkOrderWhatsAppOnTheWay({
        scopedClient,
        getAdminClient,
        userId: "user-tech-1",
        workOrderId: "wo-2",
        config: ENABLED_MOCK_CFG,
        transport,
      }),
    ).rejects.toThrow("missing_consent");
    expect(transport).not.toHaveBeenCalled();
  });

  it("never calls privileged admin client when technician is not assigned to the work order", async () => {
    const { scopedClient, getAdminClient, adminFrom } = createMockClients({
      roles: ["technician"],
      actorTechnicianId: "tech-2",
      workOrder: {
        id: "wo-3",
        customer_id: "cust-1",
        technician_id: "tech-1",
        status: "toegewezen",
        signed_at: null,
        phone: "0470 12 34 56",
        use_site_address: false,
        site_contact_phone: null,
      },
      consents: [{ customer_id: "cust-1", phone_e164: "+32470123456", status: "granted" }],
    });

    const status = await executeGetWorkOrderWhatsAppStatus({
      scopedClient,
      getAdminClient,
      userId: "user-tech-2",
      workOrderId: "wo-3",
      config: ENABLED_MOCK_CFG,
    });
    expect(status.canSend).toBe(false);
    expect(status.reason).toBe("unauthorized");
    expect(getAdminClient).not.toHaveBeenCalled();
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it("blocks send when consent for the exact number is withdrawn", async () => {
    const { scopedClient, getAdminClient } = createMockClients({
      roles: ["technician"],
      actorTechnicianId: "tech-1",
      workOrder: {
        id: "wo-4",
        customer_id: "cust-1",
        technician_id: "tech-1",
        status: "toegewezen",
        signed_at: null,
        phone: "0470 12 34 56",
        use_site_address: false,
        site_contact_phone: null,
      },
      consents: [{ customer_id: "cust-1", phone_e164: "+32470123456", status: "withdrawn" }],
    });

    const transport = vi.fn();
    await expect(
      executeSendWorkOrderWhatsAppOnTheWay({
        scopedClient,
        getAdminClient,
        userId: "user-tech-1",
        workOrderId: "wo-4",
        config: ENABLED_MOCK_CFG,
        transport,
      }),
    ).rejects.toThrow("withdrawn_consent");
    expect(transport).not.toHaveBeenCalled();
  });

  it("handles worksite vs billing contacts: uses official site contact when designated, rejects conflict otherwise", async () => {
    // Designated worksite contact: uses site_contact_phone and requires consent on THAT exact number
    const designated = createMockClients({
      roles: ["technician"],
      actorTechnicianId: "tech-1",
      workOrder: {
        id: "wo-5a",
        customer_id: "cust-1",
        technician_id: "tech-1",
        status: "toegewezen",
        signed_at: null,
        phone: "0470 11 11 11",
        use_site_address: true,
        site_contact_phone: "0470 22 22 22",
      },
      consents: [{ customer_id: "cust-1", phone_e164: "+32470222222", status: "granted" }],
    });
    const okStatus = await executeGetWorkOrderWhatsAppStatus({
      scopedClient: designated.scopedClient,
      getAdminClient: designated.getAdminClient,
      userId: "user-tech-1",
      workOrderId: "wo-5a",
      config: ENABLED_MOCK_CFG,
    });
    expect(okStatus.canSend).toBe(true);
    expect(okStatus.maskedRecipient).toBe("+32 •••••• 22");

    // Conflicting worksite & billing numbers when use_site_address is false -> ambiguous_phone, no privileged read
    const conflict = createMockClients({
      roles: ["technician"],
      actorTechnicianId: "tech-1",
      workOrder: {
        id: "wo-5b",
        customer_id: "cust-1",
        technician_id: "tech-1",
        status: "toegewezen",
        signed_at: null,
        phone: "0470 11 11 11",
        use_site_address: false,
        site_contact_phone: "0470 22 22 22",
      },
      consents: [{ customer_id: "cust-1", phone_e164: "+32470111111", status: "granted" }],
    });
    const conflictStatus = await executeGetWorkOrderWhatsAppStatus({
      scopedClient: conflict.scopedClient,
      getAdminClient: conflict.getAdminClient,
      userId: "user-tech-1",
      workOrderId: "wo-5b",
      config: ENABLED_MOCK_CFG,
    });
    expect(conflictStatus.canSend).toBe(false);
    expect(conflictStatus.reason).toBe("ambiguous_phone");
    expect(conflict.getAdminClient).not.toHaveBeenCalled();
  });
});