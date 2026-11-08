import { describe, expect, it, vi } from "vitest";
import { adminAccountSchema, adminInvitationUrl, assertAccountAdmin, persistAdminRole } from "./admin-accounts";

describe("beheerderaccounts", () => {
  it("staat alleen een bevestigde adminrol toe", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(assertAccountAdmin({ rpc }, "crew-id")).rejects.toThrow("Alleen een beheerder");
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "crew-id", _role: "admin" });
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(assertAccountAdmin({ rpc }, "admin-id")).resolves.toBeUndefined();
    rpc.mockResolvedValue({ data: true, error: { message: "offline" } });
    await expect(assertAccountAdmin({ rpc }, "admin-id")).rejects.toThrow();
  });
  it("kent uitsluitend admin toe aan het nieuw aangemaakte account", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const rollback = vi.fn();
    await persistAdminRole("new-user", insert, rollback);
    expect(insert).toHaveBeenCalledWith({ user_id: "new-user", role: "admin" });
    expect(rollback).not.toHaveBeenCalled();
  });
  it("ruimt het nieuwe account op wanneer roltoekenning mislukt", async () => {
    const rollback = vi.fn().mockResolvedValue({});
    await expect(persistAdminRole("new-user", vi.fn().mockResolvedValue({ error: { message: "denied" } }), rollback)).rejects.toThrow();
    expect(rollback).toHaveBeenCalledWith("new-user");
  });
  it("gebruikt een echt mailadres en vereist alleen bij aanmaken een wachtwoord", () => {
    expect(adminAccountSchema.parse({ mode: "invite", email: " NEW@RIORY.BE " }).email).toBe("new@riory.be");
    expect(adminAccountSchema.safeParse({ mode: "create", email: "new@riory.be" }).success).toBe(false);
    expect(adminAccountSchema.safeParse({ mode: "invite", email: "ploeg" }).success).toBe(false);
    expect(adminAccountSchema.safeParse({ mode: "create", email: "new@riory.be", password: "12345678" }).success).toBe(true);
  });
  it("houdt de uitnodiging op de publieke app met de code in het fragment", () => {
    const url = new URL(adminInvitationUrl("a".repeat(64), "invite"));
    expect(url.origin).toBe("https://werkbonnenriory.lovable.app");
    expect(url.pathname).toBe("/admin-uitnodiging");
    expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe("a".repeat(64));
    expect(() => adminInvitationUrl("invalid", "invite")).toThrow();
  });
});