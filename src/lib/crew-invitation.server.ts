import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CREW_INVITATION_HOURS, crewInvitationUrl } from "./crew-invitation";

export async function hashInvitation(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function issueCrewInvitation(db: SupabaseClient<Database>, technicianId: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + CREW_INVITATION_HOURS * 3600000).toISOString();
  const { error } = await db.from("crew_password_invitations").upsert({ technician_id: technicianId, token_hash: await hashInvitation(token), expires_at: expiresAt, consumed_at: null, created_at: new Date().toISOString() });
  if (error) throw new Error("Uitnodiging aanmaken mislukt. Probeer opnieuw.");
  return { setupUrl: crewInvitationUrl(token), expiresAt };
}