import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/task-mail")({
  server: { handlers: { POST: async ({ request }) => {
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { importTaskMailbox } = await import("@/lib/task-mail-import.server");
    const { data: admins, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    if (error) return Response.json({ error: "Beheerders lezen mislukt" }, { status: 500 });
    let imported = 0;
    const errors: string[] = [];
    // Only verified admin owners with their own appointment-mailbox connection.
    for (const owner of admins ?? []) {
      const { data: connection, error: connectionError } = await supabaseAdmin.from("app_user_connections").select("user_id").eq("user_id", owner.user_id).eq("connector_id", "microsoft_outlook").maybeSingle();
      if (connectionError) { errors.push("Mailboxverbinding lezen mislukt"); continue; }
      if (!connection) continue;
      try {
        const result = await importTaskMailbox(supabaseAdmin, owner.user_id);
        imported += result.imported;
        errors.push(...(result.errors ?? []));
      } catch (e) { errors.push(e instanceof Error ? e.message : "Afspraakmails lezen mislukt"); }
    }
    return Response.json({ imported, errors }, { status: errors.length ? 502 : 200 });
  } } },
});