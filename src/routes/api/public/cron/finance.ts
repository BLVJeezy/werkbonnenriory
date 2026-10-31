import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/finance")({ server: { handlers: { POST: async ({ request }) => {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { evaluateFinance } = await import("@/lib/finance-eval");
  const { data: companies, error } = await supabaseAdmin.from("companies").select("id,user_id");
  if (error) return new Response("read failed", { status: 500 });
  let ok = 0, failed = 0;
  for (const company of companies ?? []) {
    const { data: admin, error } = await supabaseAdmin.rpc("has_role", { _user_id: company.user_id, _role: "admin" });
    if (error || !admin) continue;
    try { await evaluateFinance(supabaseAdmin, company.user_id, company.id); ok++; } catch { failed++; }
  }
  return Response.json({ ok, failed });
} } } });