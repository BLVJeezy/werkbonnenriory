import { z } from "zod";

export const adminAccountSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("create"), email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()), password: z.string().min(8).max(72) }),
  z.object({ mode: z.literal("invite"), email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()) }),
]);

export function validAdminToken(token: string) {
  // Auth hashes are opaque: deployments can prefix/version them or use different hash lengths.
  return /^[a-zA-Z0-9_-]{32,512}$/.test(token);
}
export function adminInvitationUrl(token: string, type: "invite" | "recovery") {
  if (!validAdminToken(token)) throw new Error("Ongeldige uitnodigingscode");
  return `https://werkbonnenriory.lovable.app/admin-uitnodiging#${new URLSearchParams({ token, type })}`;
}

type RoleClient = { rpc: (name: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown; error: unknown }> };
export async function assertAccountAdmin(client: RoleClient, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || data !== true) throw new Error("Alleen een beheerder kan beheerders beheren.");
}

export async function persistAdminRole(userId: string, insert: (role: { user_id: string; role: "admin" }) => PromiseLike<{ error: { message: string } | null }>, rollback: (id: string) => PromiseLike<unknown>) {
  const { error } = await insert({ user_id: userId, role: "admin" });
  if (error) {
    await rollback(userId);
    throw new Error("Beheerder aanmaken mislukt: " + error.message);
  }
}