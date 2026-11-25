import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
  WHATSAPP_ON_THE_WAY_TEMPLATE_KEY,
  evaluateWhatsAppSendEligibility,
  type WhatsAppConsentStatus,
  type WhatsAppSendState,
} from "@/lib/whatsapp-on-the-way";

export type WorkOrderWhatsAppStatusDto = {
  enabled: boolean;
  canSend: boolean;
  maskedRecipient: string | null;
  draftTemplateText: string;
  sendState: WhatsAppSendState | null;
  reason: string | null;
};

async function loadActorRolesAndTechId(supabase: any, userId: string) {
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
  const { data: techId } = await supabase.rpc("my_technician_id");
  return { roles, actorTechnicianId: (techId as string | null) ?? null };
}

async function loadWorkOrderAndConsent(supabase: any, workOrderId: string) {
  const { data: wo } = await supabase
    .from("work_orders")
    .select("id, customer_id, technician_id, status, signed_at, phone")
    .eq("id", workOrderId)
    .maybeSingle();
  if (!wo) return null;

  let customerPhone: string | null = null;
  let customerContacts: unknown = [];
  if (wo.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("phone, contacts")
      .eq("id", wo.customer_id)
      .maybeSingle();
    customerPhone = cust?.phone ?? null;
    customerContacts = cust?.contacts ?? [];
  }

  let consentStatus: WhatsAppConsentStatus = "missing";
  if (wo.customer_id) {
    const { data: consentRow, error: consentErr } = await (supabase as any)
      .from("customer_whatsapp_consents")
      .select("status")
      .eq("customer_id", wo.customer_id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!consentErr && consentRow?.status === "granted") consentStatus = "granted";
    else if (!consentErr && consentRow?.status === "withdrawn") consentStatus = "withdrawn";
  }

  let existingSend: { id: string; status: WhatsAppSendState } | null = null;
  const { data: sendRow, error: sendErr } = await (supabase as any)
    .from("work_order_whatsapp_sends")
    .select("id, status")
    .eq("work_order_id", workOrderId)
    .eq("template_key", WHATSAPP_ON_THE_WAY_TEMPLATE_KEY)
    .maybeSingle();
  if (!sendErr && sendRow) {
    existingSend = { id: sendRow.id, status: sendRow.status as WhatsAppSendState };
  }

  return { wo, customerPhone, customerContacts, consentStatus, existingSend };
}

/** Returns feature-gated status and masked recipient for a work order (never raw secrets or unmasked phone). */
export const getWorkOrderWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(async ({ data, context }): Promise<WorkOrderWhatsAppStatusDto> => {
    const { readWhatsAppCloudConfig, isWhatsAppCloudConfigured } = await import(
      "@/lib/whatsapp-on-the-way.server"
    );
    const cfg = readWhatsAppCloudConfig();
    const enabled = isWhatsAppCloudConfigured(cfg);

    const { roles, actorTechnicianId } = await loadActorRolesAndTechId(
      context.supabase,
      context.userId,
    );
    const loaded = await loadWorkOrderAndConsent(context.supabase, data.workOrderId);
    if (!loaded) {
      return {
        enabled,
        canSend: false,
        maskedRecipient: null,
        draftTemplateText: WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
        sendState: null,
        reason: "Werkbon niet gevonden.",
      };
    }

    const eligibility = evaluateWhatsAppSendEligibility({
      roles,
      actorTechnicianId,
      workOrderTechnicianId: loaded.wo.technician_id,
      workOrderStatus: loaded.wo.status,
      signedAt: loaded.wo.signed_at,
      workOrderPhone: loaded.wo.phone,
      customerPhone: loaded.customerPhone,
      customerContacts: loaded.customerContacts,
      consentStatus: loaded.consentStatus,
    });

    if (!eligibility.ok) {
      return {
        enabled,
        canSend: false,
        maskedRecipient: null,
        draftTemplateText: WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
        sendState: loaded.existingSend?.status ?? null,
        reason: eligibility.reason,
      };
    }

    return {
      enabled,
      canSend: enabled && !loaded.existingSend,
      maskedRecipient: eligibility.masked,
      draftTemplateText: WHATSAPP_ON_THE_WAY_DRAFT_TEXT,
      sendState: loaded.existingSend?.status ?? null,
      reason: enabled ? null : "WhatsApp-verzending is momenteel uitgeschakeld.",
    };
  });

/**
 * One-click server-only send for the fixed "We zijn onderweg" utility template.
 * Never accepts recipient, template, or free text from the browser.
 */
export const sendWorkOrderWhatsAppOnTheWay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ status: WhatsAppSendState | "disabled" | "duplicate"; message: string }> => {
      const { readWhatsAppCloudConfig, isWhatsAppCloudConfigured, dispatchWhatsAppOnTheWay } =
        await import("@/lib/whatsapp-on-the-way.server");
      const cfg = readWhatsAppCloudConfig();
      if (!isWhatsAppCloudConfigured(cfg)) {
        return {
          status: "disabled",
          message: "WhatsApp-verzending staat standaard uit tot configuratie en goedkeuring.",
        };
      }

      const { roles, actorTechnicianId } = await loadActorRolesAndTechId(
        context.supabase,
        context.userId,
      );
      const loaded = await loadWorkOrderAndConsent(context.supabase, data.workOrderId);
      if (!loaded) throw new Error("Werkbon niet gevonden.");

      const eligibility = evaluateWhatsAppSendEligibility({
        roles,
        actorTechnicianId,
        workOrderTechnicianId: loaded.wo.technician_id,
        workOrderStatus: loaded.wo.status,
        signedAt: loaded.wo.signed_at,
        workOrderPhone: loaded.wo.phone,
        customerPhone: loaded.customerPhone,
        customerContacts: loaded.customerContacts,
        consentStatus: loaded.consentStatus,
      });
      if (!eligibility.ok) {
        throw new Error(`Verzending geweigerd (${eligibility.reason}).`);
      }

      // Durable, atomic duplicate protection BEFORE any outbound call
      const { data: claim, error: claimErr } = await (context.supabase as any)
        .from("work_order_whatsapp_sends")
        .insert({
          work_order_id: data.workOrderId,
          customer_id: loaded.wo.customer_id,
          template_key: WHATSAPP_ON_THE_WAY_TEMPLATE_KEY,
          recipient_masked: eligibility.masked,
          status: "prepared",
          sent_by: context.userId,
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
        recipientE164: eligibility.e164,
        config: cfg,
      });

      if (result.outcome === "accepted") {
        await (context.supabase as any)
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
        await (context.supabase as any)
          .from("work_order_whatsapp_sends")
          .update({ status: "failed", error_code: String(result.httpStatus) })
          .eq("id", claim.id);
        return { status: "failed", message: "WhatsApp weigerde het bericht." };
      }

      await (context.supabase as any)
        .from("work_order_whatsapp_sends")
        .update({ status: "uncertain", error_code: "uncertain_outcome" })
        .eq("id", claim.id);
      return {
        status: "uncertain",
        message: "Onzeker resultaat van WhatsApp; er wordt niet automatisch opnieuw verzonden.",
      };
    },
  );