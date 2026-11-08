import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeTokenMatch(token: string, expectedHash: string) {
  const actual = Buffer.from(hashDeviceToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function requireApprovedDevice(token: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error("Dit toestel is niet goedgekeurd");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tokenHash = hashDeviceToken(token);
  const { data, error } = await supabaseAdmin
    .from("tk_approved_devices")
    .select("id, status")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data || data.status !== "approved" || !safeTokenMatch(token, tokenHash)) {
    throw new Error("Dit toestel is niet goedgekeurd");
  }
  await supabaseAdmin.from("tk_approved_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return data.id;
}