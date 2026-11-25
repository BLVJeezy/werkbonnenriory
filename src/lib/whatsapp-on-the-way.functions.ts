import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WhatsAppSendState } from "@/lib/whatsapp-on-the-way";

export type WorkOrderWhatsAppStatusDto = {
  enabled: boolean;
  canSend: boolean;
  maskedRecipient: string | null;
  draftTemplateText: string;
  sendState: WhatsAppSendState | null;
  reason: string | null;
};

/** Returns feature-gated status and masked recipient for a work order (never raw secrets or unmasked phone). */
export const getWorkOrderWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(async ({ data, context }): Promise<WorkOrderWhatsAppStatusDto> => {
    const { executeGetWorkOrderWhatsAppStatus } = await import(
      "@/lib/whatsapp-on-the-way.server"
    );
    return executeGetWorkOrderWhatsAppStatus({
      scopedClient: context.supabase,
      getAdminClient: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin;
      },
      userId: context.userId,
      workOrderId: data.workOrderId,
    });
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
      const { executeSendWorkOrderWhatsAppOnTheWay } = await import(
        "@/lib/whatsapp-on-the-way.server"
      );
      return executeSendWorkOrderWhatsAppOnTheWay({
        scopedClient: context.supabase,
        getAdminClient: async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return supabaseAdmin;
        },
        userId: context.userId,
        workOrderId: data.workOrderId,
      });
    },
  );