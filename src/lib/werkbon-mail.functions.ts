import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { werkbonMailData } from "@/lib/werkbon-mail";
import { werkbonNr } from "@/lib/werkbon-number";
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
    const mailData = werkbonMailData(wo, activity?.name ?? null, seconds,
      (m.data ?? []).map((x) => ({ name: x.name, quantity: Number(x.quantity), unit: x.unit })));
    const { createWerkbonPdf, werkbonPdfMessage } = await import("@/lib/werkbon-pdf");
    const { loadWerkbonPhotos } = await import('./werkbon-photos.server');
    const pdf = await createWerkbonPdf(mailData, await loadWerkbonPhotos(supabase, wo.id));
    let binary = "";
    for (const byte of pdf) binary += String.fromCharCode(byte);
    const { prepareDocument } = await import('./document-tracking.server');
    const tracking = await prepareDocument('werkbon', wo.id, `Werkbon ${werkbonNr(wo.number)}`, wo.email, btoa(binary));
    const signingCode = await ensureSigningCode(supabase, wo.id, wo.signing_code);
    const { werkbonSigningLink } = await import("@/lib/work-order-signing-link");
    const message = werkbonPdfMessage(mailData, wo.email, btoa(binary), tracking.url,
      signingCode ? { url: werkbonSigningLink(wo.id), code: signingCode } : undefined);

    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    let result: SendWerkbonResult = { sent: true };
    await tracking.send(async () => {
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR,
      path: "/me/sendMail",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
        }),
      },
      requiredScopes: WERKBON_MAIL_SCOPES,
    });
    if (await appUserReconnectRequired(res)) { result = { sent: false, reason: 'reconnect_required' }; throw new Error('Opnieuw koppelen vereist'); }
    if (!res.ok) {
      console.error("werkbon sendMail failed", res.status, await res.text());
      result = { sent: false, reason: 'send_failed' }; throw new Error('Mail niet aanvaard');
    }
    }).catch(() => { if (result.sent) result = { sent: false, reason: 'send_failed' }; });
    return result;
  });

const SIGNING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Every werkbon mail carries a 12-character random signing code (~60 bits); legacy short codes are replaced. */
async function ensureSigningCode(supabase: any, workOrderId: string, existing: string | null): Promise<string | null> {
  if (existing && /^[A-Z2-9]{12}$/.test(existing)) return existing;
  for (let i = 0; i < 5; i++) {
    const buf = new Uint8Array(12);
    crypto.getRandomValues(buf);
    const code = Array.from(buf, (b) => SIGNING_ALPHABET[b % 32]).join("");
    let q = supabase.from("work_orders").update({ signing_code: code }).eq("id", workOrderId);
    q = existing ? q.eq("signing_code", existing) : q.is("signing_code", null);
    const { data, error } = await q
      .select("signing_code")
      .maybeSingle();
    if (data?.signing_code) return data.signing_code;
    if (!error) {
      const { data: row } = await supabase.from("work_orders").select("signing_code").eq("id", workOrderId).single();
      if (row?.signing_code) return row.signing_code;
    }
  }
  return null;
}
