import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { moveAppointmentMessage, OUTLOOK_MOVE_SCOPES } from "./appointment-mail";

const NOT_FOUND = "Niet meer gevonden in de mailbox";

export const processAppointmentMails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Alleen de beheerder kan afspraakmails verplaatsen.");
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const key = await getConnectionKeyForUser(context.userId, "microsoft_outlook");
    if (!key) return { moved: 0, pending: 0, error: "Koppel de afspraakmailbox om verwerkte mails te verplaatsen." };
    const graph = async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Prefer", 'IdType="ImmutableId"');
      const res = await callAsAppUser({ gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectionAPIKey: key, connectorId: "microsoft_outlook", path, init: { ...init, headers }, requiredScopes: OUTLOOK_MOVE_SCOPES });
      if (await appUserReconnectRequired(res)) throw new Error("Koppel afspraak@riory.be opnieuw om mails naar Uitgevoerd te verplaatsen.");
      return res;
    };
    // Mails no longer found in the inbox (e.g. moved by hand) are parked so they never block the queue.
    const notParked = `last_error.is.null,last_error.not.like.${NOT_FOUND}*`;
    const { data: jobs, error } = await sb.from("appointment_mail_moves").select("*").is("moved_at", null).or(`user_id.eq.${context.userId},user_id.is.null`).or(notParked).order("user_id", { nullsFirst: false }).order("created_at").limit(25);
    if (error) throw error;
    let moved = 0;
    let failure: string | null = null;
    for (const job of jobs ?? []) {
      try {
        if (!job.user_id) {
          // Legacy rows have no owner. Confirm the exact stored message exists in this user's mailbox first.
          const check = await graph(`/me/messages/${encodeURIComponent(job.source_message_id)}?$select=id`);
          if (check.status === 404) {
            await sb.from("appointment_mail_moves").update({ last_error: `${NOT_FOUND} (waarschijnlijk al handmatig verplaatst).` }).eq("work_order_id", job.work_order_id).is("user_id", null).is("moved_at", null);
            continue;
          }
          if (!check.ok) {
            console.error(`Appointment mail check failed [${check.status}]: ${await check.text()}`);
            throw new Error(`Afspraakmail controleren mislukt (${check.status}).`);
          }
        }
        const now = new Date().toISOString();
        const { data: claimed, error: ce } = await sb.from("appointment_mail_moves").update({ user_id: context.userId, lease_until: new Date(Date.now() + 120000).toISOString() }).eq("work_order_id", job.work_order_id).is("moved_at", null).or(`lease_until.is.null,lease_until.lt.${now}`).select("work_order_id").maybeSingle();
        if (ce) throw ce;
        if (!claimed) continue;
        await moveAppointmentMessage(graph, job.source_message_id, job.immutable_message_id, async (id) => {
          const { error: e } = await sb.from("appointment_mail_moves").update({ immutable_message_id: id }).eq("work_order_id", job.work_order_id);
          if (e) throw e;
        });
        const { error: done } = await sb.from("appointment_mail_moves").update({ moved_at: new Date().toISOString(), last_error: null, lease_until: null }).eq("work_order_id", job.work_order_id);
        if (done) throw done;
        moved++;
      } catch (e) {
        failure = e instanceof Error ? e.message : "Afspraakmail verplaatsen mislukt.";
        await sb.from("appointment_mail_moves").update({ last_error: failure, lease_until: null }).eq("work_order_id", job.work_order_id).or(`user_id.eq.${context.userId},user_id.is.null`);
        // Only a revoked/insufficient grant stops the batch; one bad mail must not block the others.
        if (failure.startsWith("Koppel afspraak@riory.be")) break;
      }
    }
    const { count } = await sb.from("appointment_mail_moves").select("work_order_id", { count: "exact", head: true }).is("moved_at", null).or(`user_id.eq.${context.userId},user_id.is.null`).or(notParked);
    return { moved, pending: count ?? 0, error: failure };
  });