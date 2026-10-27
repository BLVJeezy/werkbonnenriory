import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Hourly cron: match incoming bank payments to open invoices via Ponto. */
export const Route = createFileRoute("/api/public/ponto/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncPontoPayments } = await import("@/lib/ponto-sync.server");
          const result = await syncPontoPayments(supabaseAdmin);
          return Response.json(result);
        } catch (e) {
          console.error("ponto sync", e);
          return Response.json({ error: e instanceof Error ? e.message : "sync mislukt" }, { status: 500 });
        }
      },
    },
  },
});
