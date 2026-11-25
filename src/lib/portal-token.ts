// Portal access tokens for www.riory.be/klantportaal.
// The portal never receives a Supabase session: it gets a short-lived token that only the
// portal API accepts, so a leaked token can read one customer's portal data and nothing else.

export const PORTAL_TOKEN_TTL_SECONDS = 12 * 60 * 60;

export type PortalTokenClaims = { uid: string; email: string; exp: number; v: 1 };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(`riory-portal-token-v1:${secret}`),
  );
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signPortalToken(
  claims: { uid: string; email: string },
  secret: string,
  now = Date.now(),
  ttlSeconds = PORTAL_TOKEN_TTL_SECONDS,
): Promise<{ token: string; expiresAt: number }> {
  const payload: PortalTokenClaims = {
    uid: claims.uid,
    email: claims.email.trim().toLowerCase(),
    exp: Math.floor(now / 1000) + ttlSeconds,
    v: 1,
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)),
  );
  return { token: `rp1.${body}.${b64url(sig)}`, expiresAt: payload.exp * 1000 };
}

export async function verifyPortalToken(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<PortalTokenClaims | null> {
  const m = /^rp1\.([A-Za-z0-9_-]{10,2000})\.([A-Za-z0-9_-]{20,200})$/.exec(token);
  if (!m) return null;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromB64url(m[2]!);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, enc.encode(m[1]!));
  if (!ok) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[1]!))) as PortalTokenClaims;
    if (claims.v !== 1 || typeof claims.uid !== "string" || typeof claims.email !== "string")
      return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
