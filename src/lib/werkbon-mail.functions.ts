import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderWerkbonMail, werkbonMailData } from "@/lib/werkbon-mail";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { WERKBON_MAILBOX_KEY } from "@/lib/werkbon-mailbox.functions";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR = "microsoft_outlook";

export type SendWerkbonResult =
  | { sent: true }
  | { sent: false; reason: "not_signed" | "no_email" | "mailbox_not_connected" | "reconnect_required" | "send_failed" };

/** Sends the signed work order to the customer from the admin's linked werkbon mailbox (info@riory.be). */
export const sendWerkbonEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workOrderId: string }) => input)
  .handler(async ({ data, context }): Promise<SendWerkbonResult> => {
    const { supabase } = context;
    // RLS: admins see everything, crews only their assigned orders — a missing row means no access.
    const { data: wo } = await supabase.from("work_orders").select("*").eq("id", data.workOrderId).single();
    if (!wo) throw new Error("Werkbon niet gevonden");
    if (wo.status !== "afgetekend") return { sent: false, reason: "not_signed" };
    if (!wo.email) return { sent: false, reason: "no_email" };

    const [t, m, acts] = await Promise.all([
      supabase.from("time_entries").select("*").eq("work_order_id", wo.id),
      supabase.from("materials").select("name, quantity, unit").eq("work_order_id", wo.id).order("created_at"),
      supabase.from("activities").select("id, name"),
    ]);

    // The mail goes out from the admin's linked mailbox, whoever triggered the send.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    let key: string | null = null;
    for (const a of admins ?? []) {
      key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY);
      if (key) break;
    }
    if (!key) return { sent: false, reason: "mailbox_not_connected" };

    const seconds = (t.data ?? []).reduce(
      (s, e) => s + (e.ended_at ? (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000 : 0),
      0,
    );
    const activity = (acts.data ?? []).find((a) => a.id === wo.activity_id);
    const html = renderWerkbonMail(werkbonMailData(wo, activity?.name ?? null, seconds,
      (m.data ?? []).map((x) => ({ name: x.name, quantity: Number(x.quantity), unit: x.unit }))));

    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR,
      path: "/me/sendMail",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: `Werkbon #${wo.number} — ${wo.customer_name}`,
            body: { contentType: "HTML", content: html },
            toRecipients: [{ emailAddress: { address: wo.email } }],
          },
        }),
      },
      requiredScopes: WERKBON_MAIL_SCOPES,
    });
    if (await appUserReconnectRequired(res)) return { sent: false, reason: "reconnect_required" };
    if (!res.ok) {
      console.error("werkbon sendMail failed", res.status, await res.text());
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  });
