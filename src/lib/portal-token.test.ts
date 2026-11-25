import { describe, expect, it } from "vitest";
import { signPortalToken, verifyPortalToken } from "./portal-token";

describe("portal tokens", () => {
  const secret = "test-secret";
  const now = Date.UTC(2026, 10, 25, 12);

  it("round-trips the user id and normalized email", async () => {
    const { token, expiresAt } = await signPortalToken(
      { uid: "u1", email: " Jason@Gmail.com " },
      secret,
      now,
    );
    expect(token.startsWith("rp1.")).toBe(true);
    expect(expiresAt).toBe(now + 12 * 3600 * 1000);
    expect(await verifyPortalToken(token, secret, now + 1000)).toMatchObject({
      uid: "u1",
      email: "jason@gmail.com",
    });
  });

  it("rejects expired, tampered or foreign tokens", async () => {
    const { token } = await signPortalToken({ uid: "u1", email: "a@b.be" }, secret, now);
    expect(await verifyPortalToken(token, secret, now + 13 * 3600 * 1000)).toBeNull();
    expect(await verifyPortalToken(token, "other-secret", now)).toBeNull();
    const [p, body, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ uid: "admin", email: "a@b.be", exp: 9999999999, v: 1 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifyPortalToken(`${p}.${forged}.${sig}`, secret, now)).toBeNull();
    expect(await verifyPortalToken(`${p}.${body}.${sig}x`, secret, now)).toBeNull();
    expect(await verifyPortalToken("eyJhbGciOi.jwt.token", secret, now)).toBeNull();
  });
});
