import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Hourly cron: import scanned/emailed purchase invoices from the info mailbox. */
export const Route = createFileRoute("/api/public/aankoopfacturen/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          const lovableKey = process.env['LOVABLE_API_KEY'];
          if (!lovableKey) throw new Error("LOVABLE_API_KEY ontbreekt");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
          const { WERKBON_MAILBOX_KEY } = await import("@/lib/werkbon-mailbox.functions");
          const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
          let key: string | null = null;
          for (const a of admins ?? []) { key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY); if (key) break; }
          if (!key) return Response.json({ skipped: "mailbox niet gekoppeld" });
          const { importPurchaseInvoicesFromMail } = await import("@/lib/purchase-import.server");
          return Response.json(await importPurchaseInvoicesFromMail(supabaseAdmin, key, lovableKey));
        } catch (e) {
          console.error("aankoopfacturen import", e);
          return Response.json({ error: e instanceof Error ? e.message : "import mislukt" }, { status: 500 });
        }
      },
    },
  },
});
