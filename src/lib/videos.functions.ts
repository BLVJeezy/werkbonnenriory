import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { WERKBON_MAILBOX_KEY } from "@/lib/werkbon-mailbox.functions";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";
import { customerVideoLink } from "@/lib/video-link";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR = "microsoft_outlook";
const BUCKET = "klant-filmpjes";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Alleen de beheerder mag filmpjes beheren");
}

export type CustomerVideo = { id: string; title: string; token: string; created_at: string };

/** Lists the videos shared for a work order (admin only). */
export const listWorkOrderVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(async ({ data, context }): Promise<CustomerVideo[]> => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("customer_videos").select("id, title, token, created_at")
      .eq("work_order_id", data.workOrderId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Registers a video after the browser uploaded it to private storage (admin only). */
export const registerCustomerVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string; customerId: string | null; path: string; title: string }) => i)
  .handler(async ({ data, context }): Promise<CustomerVideo> => {
    await assertAdmin(context);
    if (!data.path.startsWith(`${data.workOrderId}/`)) throw new Error("Ongeldig filmpjespad");
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    const token = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: row, error } = await context.supabase.from("customer_videos").insert({
      work_order_id: data.workOrderId, customer_id: data.customerId, path: data.path,
      title: data.title.trim().slice(0, 120), token,
    }).select("id, title, token, created_at").single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Deletes a shared video: the row and the private file (admin only). */
export const deleteCustomerVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { videoId: string }) => i)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase.from("customer_videos").delete().eq("id", data.videoId).select("path").single();
    if (error) throw new Error(error.message);
    if (row?.path) await context.supabase.storage.from(BUCKET).remove([row.path]);
    return { ok: true };
  });

/** Mails the video link to the customer from the info@riory.be mailbox (admin only). */
export const mailCustomerVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { videoId: string }) => i)
  .handler(async ({ data, context }): Promise<{ sent: boolean; reason?: string }> => {
    await assertAdmin(context);
    const { data: video } = await context.supabase.from("customer_videos").select("*").eq("id", data.videoId).single();
    if (!video) throw new Error("Filmpje niet gevonden");
    if (!video.work_order_id) return { sent: false, reason: "no_email" };
    const { data: wo } = await context.supabase.from("work_orders").select("number, email, customer_id").eq("id", video.work_order_id).single();
    const email = wo?.email ?? null;
    if (!email) return { sent: false, reason: "no_email" };
    const { data: cust } = wo?.customer_id
      ? await context.supabase.from("customers").select("name").eq("id", wo.customer_id).maybeSingle()
      : { data: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    let key: string | null = null;
    for (const a of admins ?? []) {
      key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY);
      if (key) break;
    }
    if (!key) return { sent: false, reason: "mailbox_not_connected" };

    const link = customerVideoLink(video.token);
    const { brandedBody } = await import("@/lib/mail-html");
    const naam = (cust as { name?: string } | null)?.name ?? "";
    const message = {
      subject: `Filmpje van onze werken${wo?.number ? ` (werkbon #${wo.number})` : ""}`,
      body: brandedBody(
        `Beste${naam ? ` ${naam}` : ""}\n\n` +
        `Via onderstaande link kan je een filmpje bekijken van de werken die we bij je uitvoerden.\n\n` +
        `${link}\n\n` +
        `De link blijft werken; het filmpje kan enkel bekeken worden, niet gedownload.\n\n` +
        `Met vriendelijke groeten\nRiory`,
      ),
      toRecipients: [{ emailAddress: { address: email } }],
    };
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey: key,
      connectorId: CONNECTOR,
      path: "/me/sendMail",
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) },
      requiredScopes: WERKBON_MAIL_SCOPES,
    });
    if (await appUserReconnectRequired(res)) return { sent: false, reason: "reconnect_required" };
    if (!res.ok) {
      console.error("video sendMail failed", res.status, await res.text());
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true };
  });

/** Public: resolves a share token to a short-lived playback URL. No login needed; the token is the key. */
export const videoPlayback = createServerFn({ method: "GET" })
  .inputValidator((i: { token: string }) => i)
  .handler(async ({ data }): Promise<{ title: string; url: string }> => {
    const token = String(data.token ?? "").trim();
    if (!/^[0-9a-f]{32}$/.test(token)) throw new Error("Ongeldige link");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: video } = await supabaseAdmin.from("customer_videos").select("title, path").eq("token", token).maybeSingle();
    if (!video) throw new Error("Filmpje niet gevonden");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(video.path, 3600);
    if (error || !signed?.signedUrl) throw new Error("Filmpje kon niet geladen worden");
    return { title: video.title || "Filmpje", url: signed.signedUrl };
  });
