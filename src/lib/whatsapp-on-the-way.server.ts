import {
  WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
  WHATSAPP_ON_THE_WAY_TEMPLATE_KEY,
  buildStaticWhatsAppTemplatePayload,
  canActorSendWorkOrderWhatsApp,
  evaluateWhatsAppSendEligibility,
  isWorkOrderTerminal,
  resolveWorkOrderWhatsAppRecipient,
  type WhatsAppConsentStatus,
  type WhatsAppSendState,
} from "@/lib/whatsapp-on-the-way";

export type WhatsAppCloudConfig = {
  enabled: boolean;
  phoneNumberId: string;
  apiVersion: string;
  accessToken: string;
  templateName: string;
  templateLanguage: string;
};

export type WhatsAppDispatchResult =
  | { outcome: "disabled"; reason: string }
  | { outcome: "accepted"; providerMessageId: string }
  | { outcome: "failed"; httpStatus: number }
  | { outcome: "uncertain"; reason: string };

export type WhatsAppTransport = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/** Reads server-only WhatsApp Cloud API config. Defaults strictly disabled. */
export function readWhatsAppCloudConfig(): WhatsAppCloudConfig {
  return {
    enabled: process.env["WHATSAPP_ON_THE_WAY_ENABLED"] === "true",
    phoneNumberId: (process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? "").trim(),
    apiVersion: (process.env["WHATSAPP_API_VERSION"] ?? "v25.0").trim(),
    accessToken: (process.env["WHATSAPP_ACCESS_TOKEN"] ?? "").trim(),
    templateName: (process.env["WHATSAPP_ON_THE_WAY_TEMPLATE_NAME"] ?? "").trim(),
    templateLanguage: (process.env["WHATSAPP_ON_THE_WAY_TEMPLATE_LANGUAGE"] ?? "nl").trim(),
  };
}

export function isWhatsAppCloudConfigured(cfg: WhatsAppCloudConfig): boolean {
  return Boolean(
    cfg.enabled &&
      cfg.phoneNumberId &&
      cfg.apiVersion &&
      cfg.accessToken &&
      cfg.templateName &&
      cfg.templateLanguage,
  );
}

/**
 * Dispatches the fixed static "We zijn onderweg" utility template via Meta WhatsApp Cloud API.
 * Fails closed when disabled or incomplete. Never retries automatically on uncertain outcomes.
 */
export async function dispatchWhatsAppOnTheWay(input: {
  recipientE164: string;
  config?: WhatsAppCloudConfig;
  transport?: WhatsAppTransport;
}): Promise<WhatsAppDispatchResult> {
  const cfg = input.config ?? readWhatsAppCloudConfig();
  if (!isWhatsAppCloudConfigured(cfg)) {
    return {
      outcome: "disabled",
      reason: "WhatsApp-verzending staat uit of is nog niet volledig geconfigureerd.",
    };
  }

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  const payload = buildStaticWhatsAppTemplatePayload({
    recipientE164: input.recipientE164,
    templateName: cfg.templateName,
    templateLanguage: cfg.templateLanguage,
  });

  const transport: WhatsAppTransport =
    input.transport ?? ((u, init) => fetch(u, init) as Promise<any>);

  try {
    const res = await transport(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const body = await res.json().catch(() => null);
      const msgId = body?.messages?.[0]?.id;
      if (typeof msgId === "string" && msgId.length > 0) {
        return { outcome: "accepted", providerMessageId: msgId };
      }
      return { outcome: "uncertain", reason: "Geen bericht-ID ontvangen van WhatsApp." };
    }

    if (res.status >= 400 && res.status < 500) {
      return { outcome: "failed", httpStatus: res.status };
    }

    return { outcome: "uncertain", reason: `Onzekere providerstatus (${res.status}).` };
  } catch {
    return { outcome: "uncertain", reason: "Netwerkfout of time-out bij WhatsApp-aanroep." };
  }
}

async function loadActorRolesAndTechId(scopedClient: any, userId: string) {
  const { data: roleRows } = await scopedClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const { data: techId } = await scopedClient.rpc("my_technician_id");
  return { roles, actorTechnicianId: (techId as string | null) ?? null };
}

/**
 * Privileged server-only consent lookup by exact (customer_id, phone_e164).
 * Never exposes consent rows to the caller; fails closed on error, missing, withdrawn, or ambiguous rows.
 */
async function lookupExactRecipientConsent(
  adminClient: any,
  customerId: string | null | undefined,
  phoneE164: string,
): Promise<WhatsAppConsentStatus> {
  if (!customerId) return "missing";
  const { data, error } = await adminClient
    .from("customer_whatsapp_consents")
    .select("status")
    .eq("customer_id", customerId)
    .eq("phone_e164", phoneE164);

  if (error) return "error";
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return "missing";
  if (rows.length > 1) return "ambiguous";
  const status = rows[0]?.status;
  if (status === "granted") return "granted";
  if (status === "withdrawn") return "withdrawn";
  return "missing";
}

async function loadExistingSend(
  adminClient: any,
  workOrderId: string,
): Promise<{ id: string; status: WhatsAppSendState } | null> {
  const { data: sendRow, error: sendErr } = await adminClient
    .from("work_order_whatsapp_sends")
    .select("id, status")
    .eq("work_order_id", workOrderId)
    .eq("template_key", WHATSAPP_ON_THE_WAY_TEMPLATE_KEY)
    .maybeSingle();
  if (sendErr || !sendRow) return null;
  return { id: sendRow.id, status: sendRow.status as WhatsAppSendState };
}

/**
 * Authorizes the actor and resolves the single exact recipient using ONLY the ordinary
 * authenticated RLS-scoped client. Only after authorization + active check + exact recipient
 * resolution does it call the privileged server-only adminClient for consent & send state.
 */
async function authorizeAndCheckConsent(input: {
  scopedClient: any;
  getAdminClient: () => Promise<any>;
  userId: string;
  workOrderId: string;
}) {
  const { roles, actorTechnicianId } = await loadActorRolesAndTechId(
    input.scopedClient,
    input.userId,
  );

  const { data: wo } = await input.scopedClient
    .from("work_orders")
    .select("id, customer_id, technician_id, status, signed_at, phone, use_site_address, site_contact_phone")
    .eq("id", input.workOrderId)
    .maybeSingle();

  if (!wo) {
    return { ok: false as const, reason: "Werkbon niet gevonden.", existingSend: null };
  }

  // Gate 1: actor authorization & active work order BEFORE any privileged read
  const auth = canActorSendWorkOrderWhatsApp({
    roles,
    actorTechnicianId,
    workOrderTechnicianId: wo.technician_id,
  });
  if (!auth.ok) {
    return { ok: false as const, reason: auth.reason, existingSend: null };
  }
  if (isWorkOrderTerminal(wo.status, wo.signed_at)) {
    return { ok: false as const, reason: "terminal_work_order" as const, existingSend: null };
  }

  // Gate 2: load customer contact fallback via scoped client only when needed
  let customerPhone: string | null = null;
  let customerContacts: unknown = [];
  if (wo.customer_id && !wo.phone && !wo.site_contact_phone) {
    const { data: cust } = await input.scopedClient
      .from("customers")
      .select("phone, contacts")
      .eq("id", wo.customer_id)
      .maybeSingle();
    customerPhone = cust?.phone ?? null;
    customerContacts = cust?.contacts ?? [];
  }

  // Gate 3: resolve exact unambiguous BE/NL recipient BEFORE privileged consent read
  const recipient = resolveWorkOrderWhatsAppRecipient({
    useSiteAddress: wo.use_site_address,
    siteContactPhone: wo.site_contact_phone,
    workOrderPhone: wo.phone,
    customerPhone,
    customerContacts,
  });
  if (!recipient.ok) {
    return { ok: false as const, reason: recipient.reason, existingSend: null };
  }

  // Gate 4: privileged server-only consent lookup by exact (customer_id, phone_e164)
  const adminClient = await input.getAdminClient();
  const [consentStatus, existingSend] = await Promise.all([
    lookupExactRecipientConsent(adminClient, wo.customer_id, recipient.e164),
    loadExistingSend(adminClient, wo.id),
  ]);

  const eligibility = evaluateWhatsAppSendEligibility({
    roles,
    actorTechnicianId,
    workOrderTechnicianId: wo.technician_id,
    workOrderStatus: wo.status,
    signedAt: wo.signed_at,
    useSiteAddress: wo.use_site_address,
    siteContactPhone: wo.site_contact_phone,
    workOrderPhone: wo.phone,
    customerPhone,
    customerContacts,
    consentStatus,
  });

  if (!eligibility.ok) {
    return { ok: false as const, reason: eligibility.reason, existingSend };
  }

  return {
    ok: true as const,
    wo,
    adminClient,
    eligibility,
    existingSend,
  };
}

export async function executeGetWorkOrderWhatsAppStatus(input: {
  scopedClient: any;
  getAdminClient: () => Promise<any>;
  userId: string;
  workOrderId: string;
  config?: WhatsAppCloudConfig;
}) {
  const cfg = input.config ?? readWhatsAppCloudConfig();
  const enabled = isWhatsAppCloudConfigured(cfg);
  const check = await authorizeAndCheckConsent(input);

  if (!check.ok) {
    return {
      enabled,
      canSend: false,
      maskedRecipient: null,
      draftTemplateText: WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
      sendState: check.existingSend?.status ?? null,
      reason: check.reason,
    };
  }

  return {
    enabled,
    canSend: enabled && !check.existingSend,
    maskedRecipient: check.eligibility.masked,
    draftTemplateText: WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
    sendState: check.existingSend?.status ?? null,
    reason: enabled ? null : "WhatsApp-verzending is momenteel uitgeschakeld.",
  };
}

export async function executeSendWorkOrderWhatsAppOnTheWay(input: {
  scopedClient: any;
  getAdminClient: () => Promise<any>;
  userId: string;
  workOrderId: string;
  config?: WhatsAppCloudConfig;
  transport?: WhatsAppTransport;
}): Promise<{ status: WhatsAppSendState | "disabled" | "duplicate"; message: string }> {
  const cfg = input.config ?? readWhatsAppCloudConfig();
  if (!isWhatsAppCloudConfigured(cfg)) {
    return {
      status: "disabled",
      message: "WhatsApp-verzending staat standaard uit tot configuratie en goedkeuring.",
    };
  }

  const check = await authorizeAndCheckConsent(input);
  if (!check.ok) {
    throw new Error(`Verzending geweigerd (${check.reason}).`);
  }

  // Server-mediated atomic duplicate protection BEFORE any outbound call
  const { data: claim, error: claimErr } = await check.adminClient
    .from("work_order_whatsapp_sends")
    .insert({
      work_order_id: input.workOrderId,
      customer_id: check.wo.customer_id,
      template_key: WHATSAPP_ON_THE_WAY_TEMPLATE_KEY,
      recipient_masked: check.eligibility.masked,
      status: "prepared",
      sent_by: input.userId,
    })
    .select("id")
    .single();

  if (claimErr || !claim?.id) {
    return {
      status: "duplicate",
      message: "Dit onderweg-bericht werd al voorbereid of verzonden voor deze werkbon.",
    };
  }

  const result = await dispatchWhatsAppOnTheWay({
    recipientE164: check.eligibility.e164,
    config: cfg,
    ...(input.transport ? { transport: input.transport } : {}),
  });

  if (result.outcome === "accepted") {
    await check.adminClient
      .from("work_order_whatsapp_sends")
      .update({
        status: "accepted",
        provider_message_id: result.providerMessageId,
      })
      .eq("id", claim.id);
    return {
      status: "accepted",
      message: "Geaccepteerd door WhatsApp (bezorging pas bevestigd via webhook).",
    };
  }

  if (result.outcome === "failed") {
    await check.adminClient
      .from("work_order_whatsapp_sends")
      .update({ status: "failed", error_code: String(result.httpStatus) })
      .eq("id", claim.id);
    return { status: "failed", message: "WhatsApp weigerde het bericht." };
  }

  await check.adminClient
    .from("work_order_whatsapp_sends")
    .update({ status: "uncertain", error_code: "uncertain_outcome" })
    .eq("id", claim.id);
  return {
    status: "uncertain",
    message: "Onzeker resultaat van WhatsApp; er wordt niet automatisch opnieuw verzonden.",
  };
}