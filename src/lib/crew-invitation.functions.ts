import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invitationUsable, crewPasswordSchemaMessage } from "./crew-invitation";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const invalid = "Deze uitnodiging is verlopen of al gebruikt. Vraag de beheerder om een nieuwe link.";

export const inviteCrewPassword = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Alleen de beheerder kan uitnodigen");
    const { data: crew, error: crewError } = await context.supabase.from("technicians").select("id,user_id,external_planning").eq("id", data.id).single();
    if (crewError || !crew?.user_id || crew.external_planning) throw new Error("Deze ploeg heeft geen interne login");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { issueCrewInvitation } = await import("./crew-invitation.server");
    return issueCrewInvitation(supabaseAdmin, crew.id);
  });

export const readCrewInvitation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashInvitation } = await import("./crew-invitation.server");
    const { data: invitation, error } = await supabaseAdmin.from("crew_password_invitations").select("technician_id,expires_at,consumed_at").eq("token_hash", await hashInvitation(data.token)).maybeSingle();
    if (error || !invitation || !invitationUsable(invitation)) throw new Error(invalid);
    const { data: crew, error: crewError } = await supabaseAdmin.from("technicians").select("name,user_id,external_planning").eq("id", invitation.technician_id).single();
    if (crewError || !crew?.user_id || crew.external_planning) throw new Error(invalid);
    return { name: crew.name };
  });

export const acceptCrewInvitation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema, password: z.string().min(8, crewPasswordSchemaMessage).max(72, crewPasswordSchemaMessage) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashInvitation } = await import("./crew-invitation.server");
    const hash = await hashInvitation(data.token);
    const { data: invitation, error: readError } = await supabaseAdmin.from("crew_password_invitations").select("technician_id,expires_at,consumed_at").eq("token_hash", hash).maybeSingle();
    if (readError || !invitation || !invitationUsable(invitation)) throw new Error(invalid);
    const { data: crew, error: crewError } = await supabaseAdmin.from("technicians").select("name,user_id,external_planning").eq("id", invitation.technician_id).single();
    if (crewError || !crew?.user_id || crew.external_planning) throw new Error(invalid);
    const { data: roles, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", crew.user_id);
    if (roleError || !roles?.length || roles.some((r) => r.role !== "technician")) throw new Error(invalid);
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_crew_password_invitation", { p_hash: hash });
    if (claimError || claimed !== invitation.technician_id) throw new Error(invalid);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(crew.user_id, { password: data.password });
    if (error) {
      const { error: releaseError } = await supabaseAdmin.from("crew_password_invitations").update({ consumed_at: null }).eq("token_hash", hash);
      if (releaseError) throw new Error("Opslaan mislukt. Vraag de beheerder om een nieuwe uitnodiging.");
      throw new Error("Wachtwoord niet opgeslagen. Kies een sterker wachtwoord en probeer opnieuw.");
    }
    return { name: crew.name };
  });