import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { billableHours, computeTotals, euro } from "@/lib/billing";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";
import { WERKBON_MAILBOX_KEY } from "@/lib/werkbon-mailbox.functions";
import { getConnectionKeyForUser } from "@/lib/appUserConnections.server";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR = "microsoft_outlook";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

    const [t, m, acts, st] = await Promise.all([
      supabase.from("time_entries").select("*").eq("work_order_id", wo.id),
      supabase.from("materials").select("*").eq("work_order_id", wo.id).order("created_at"),
      supabase.from("activities").select("*"),
      supabase.from("settings").select("*").eq("id", 1).single(),
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
    const totals = computeTotals({
      seconds,
      hourlyRate: Number(activity?.hourly_rate ?? 0),
      distanceKm: wo.distance_km == null ? null : Number(wo.distance_km),
      kmRate: Number(st.data?.km_rate ?? 0),
      materials: (m.data ?? []).map((x) => ({ quantity: Number(x.quantity), unit_price: Number(x.unit_price) })),
      vatRate: Number(wo.vat_rate),
      warranty: wo.warranty,
    });

    const hours = billableHours(seconds);
    const row = (l: string, v: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#555">${l}</td><td style="padding:4px 0;font-weight:bold">${v}</td></tr>`;
    const matRows = (m.data ?? [])
      .map(
        (x) =>
          `<tr><td style="padding:2px 12px 2px 0">${esc(x.name)}</td><td style="padding:2px 12px 2px 0">${x.quantity} ${esc(x.unit)}</td><td style="padding:2px 0;text-align:right">${euro(Number(x.quantity) * Number(x.unit_price))}</td></tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
<h1 style="font-size:22px;margin:0 0 4px">Werkbon #${wo.number}</h1>
<p style="margin:0 0 16px;color:#555">Riory — bedankt voor uw vertrouwen.</p>
<table style="border-collapse:collapse;margin-bottom:16px">
${row("Klant", esc(wo.customer_name))}
${wo.address ? row("Adres", esc(wo.address)) : ""}
${activity ? row("Activiteit", esc(activity.name)) : ""}
${wo.signed_at ? row("Datum", new Date(wo.signed_at).toLocaleString("nl-BE")) : ""}
${wo.description ? row("Omschrijving", esc(wo.description)) : ""}
</table>
<table style="border-collapse:collapse;margin-bottom:16px">
${row("Arbeid", `${hours.toLocaleString("nl-BE")} u${wo.warranty ? " − 1 u garantie" : ""} × ${euro(Number(activity?.hourly_rate ?? 0))} = ${euro(totals.labour)}`)}
${wo.distance_km != null ? row("Kilometers", `${Number(wo.distance_km).toLocaleString("nl-BE")} km heen en terug${wo.warranty ? " (garantie: gratis)" : ""} = ${euro(totals.km)}`) : ""}
</table>
${matRows ? `<h2 style="font-size:16px;margin:0 0 4px">Materialen</h2><table style="border-collapse:collapse;margin-bottom:16px">${matRows}</table>` : ""}
<table style="border-collapse:collapse;border-top:2px solid #222;padding-top:8px">
${row("Totaal excl. btw", euro(totals.net))}
${row(`Btw ${Number(wo.vat_rate)}%`, euro(totals.vat))}
${row("<strong>Te betalen</strong>", euro(totals.total))}
</table>
${wo.paid_at ? `<p style="margin-top:16px">Betaald: ${euro(Number(wo.paid_amount))} via ${esc(wo.paid_method ?? "")} op ${new Date(wo.paid_at).toLocaleString("nl-BE")}.</p>` : ""}
${wo.signed_name ? `<p style="margin-top:16px">Afgetekend door ${esc(wo.signed_name)}.</p>` : ""}
<p style="margin-top:24px;color:#555;font-size:13px">Met vriendelijke groeten,<br>Riory</p>
</body></html>`;

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
