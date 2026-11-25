import { buildStaticWhatsAppTemplatePayload } from "@/lib/whatsapp-on-the-way";

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