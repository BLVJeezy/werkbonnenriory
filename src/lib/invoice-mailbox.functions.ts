import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  authorizeAppUserOAuth,
  disconnectAppUser,
  exchangeAppUserOAuthCode,
} from "@/integrations/lovable/appUserConnector";
import {
  deleteConnectionKeyForUser,
  getConnectionKeyForUser,
  saveConnectionKeyForUser,
} from "@/lib/appUserConnections.server";
import { WERKBON_MAIL_SCOPES } from "@/lib/outlook-scopes";

import { INVOICE_MAILBOX_KEY, INVOICE_MAILBOX_ADDRESS, assertInvoiceMailbox } from "./mail-senders";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR = "microsoft_outlook";
/** Storage key for the boekhouding@riory.be connection — the gateway connector stays "microsoft_outlook". */
export { INVOICE_MAILBOX_KEY, INVOICE_MAILBOX_ADDRESS } from "./mail-senders";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Alleen de beheerder kan de mailbox koppelen");
}

export const startInvoiceMailboxConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const clientKey = process.env["MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Mailbox-koppeling is niet ingesteld");
    const request = getRequest();
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/microsoft_outlook/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const existing = await getConnectionKeyForUser(context.userId, INVOICE_MAILBOX_KEY);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR,
      appUserId: `${context.userId}:invoice`,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: WERKBON_MAIL_SCOPES, prompt: "select_account", login_hint: INVOICE_MAILBOX_ADDRESS },
    });
    return { authorizationUrl };
  });

export const completeInvoiceMailboxConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== CONNECTOR) throw new Error("Verkeerde koppeling teruggekregen");
    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const profile = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR, path: "/me?$select=mail,userPrincipalName", requiredScopes: WERKBON_MAIL_SCOPES });
    if (!profile.ok) throw new Error(`Mailbox controleren mislukt [${profile.status}]: ${await profile.text()}`);
    assertInvoiceMailbox(await profile.json());
    await saveConnectionKeyForUser(context.userId, INVOICE_MAILBOX_KEY, connectionAPIKey);
    return { ok: true };
  });

export const invoiceMailboxStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = await getConnectionKeyForUser(context.userId, INVOICE_MAILBOX_KEY);
    if (!key) return { connected: false as const, mailbox: null };
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: CONNECTOR, path: "/me?$select=mail,userPrincipalName", requiredScopes: WERKBON_MAIL_SCOPES });
    if (await appUserReconnectRequired(res)) return { connected: false as const, mailbox: null, reconnectRequired: true };
    if (!res.ok) {
      console.error("invoice mailbox status", res.status, await res.text());
      return { connected: true as const, mailbox: null };
    }
    const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
    return { connected: true as const, mailbox: me.mail ?? me.userPrincipalName ?? null };
  });

export const disconnectInvoiceMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const key = await getConnectionKeyForUser(context.userId, INVOICE_MAILBOX_KEY);
    if (key) await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: CONNECTOR });
    await deleteConnectionKeyForUser(context.userId, INVOICE_MAILBOX_KEY);
    return { ok: true };
  });
