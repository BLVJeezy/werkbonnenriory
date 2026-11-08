import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { createDeviceToken, hashDeviceToken } from "@/lib/tikklok/device-access.server";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,100}$/);
const DEVICE_COOKIE = "riory_device_token";

function rememberToken(token: string) {
  setCookie(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
}

/**
 * Resolves a lasting device identity: reuses the token from the browser
 * (localStorage) or the long-lived cookie, and only registers a new device
 * when neither is known to the server.
 */
export const resolveDevice = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null; deviceName: string }) =>
    z
      .object({
        token: tokenSchema.nullish(),
        deviceName: z.string().trim().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cookieToken = getCookie(DEVICE_COOKIE);
    const candidates = [data.token, cookieToken].filter(
      (value): value is string => typeof value === "string" && tokenSchema.safeParse(value).success,
    );

    for (const token of candidates) {
      const { data: device } = await supabaseAdmin
        .from("tk_approved_devices")
        .select("status")
        .eq("token_hash", hashDeviceToken(token))
        .maybeSingle();
      if (device) {
        rememberToken(token);
        return { token, status: device.status as "pending" | "approved" | "blocked" };
      }
    }

    const token = createDeviceToken();
    const { error } = await supabaseAdmin.from("tk_approved_devices").insert({
      device_name: data.deviceName,
      token_hash: hashDeviceToken(token),
    });
    if (error) throw new Error("Toestel kon niet worden aangemeld");
    rememberToken(token);
    return { token, status: "pending" as const };
  });

export const requestDeviceAccess = createServerFn({ method: "POST" })
  .inputValidator((data: { deviceName: string }) => z.object({ deviceName: z.string().trim().min(1).max(100) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = createDeviceToken();
    const { error } = await supabaseAdmin.from("tk_approved_devices").insert({
      device_name: data.deviceName,
      token_hash: hashDeviceToken(token),
    });
    if (error) throw new Error("Toestel kon niet worden aangemeld");
    return { token, status: "pending" as const };
  });

export const getDeviceStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => ({ token: tokenSchema.parse(data.token) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: device } = await supabaseAdmin
      .from("tk_approved_devices")
      .select("device_name, status")
      .eq("token_hash", hashDeviceToken(data.token))
      .maybeSingle();
    return device ?? { device_name: "Onbekend toestel", status: "blocked" };
  });