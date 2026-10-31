import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Voorbereiding CCV Cloud-koppeling: activeert de terminal van de ploeg zodra CCV de API-sleutel levert.
export const startCcvPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => {
    if (typeof i?.workOrderId !== "string") throw new Error("Ongeldige werkbon");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { data: wo } = await context.supabase.from("work_orders").select("id, technicians(ccv_terminal_id)").eq("id", data.workOrderId).maybeSingle();
    if (!wo) throw new Error("Werkbon niet gevonden");
    const tid = (wo.technicians as { ccv_terminal_id: string | null } | null)?.ccv_terminal_id;
    if (!tid) throw new Error("Deze ploeg heeft nog geen CCV-terminal gekoppeld.");
    if (!process.env["CCV_API_KEY"]) throw new Error("CCV-koppeling is nog niet actief: de API-sleutel van CCV ontbreekt nog. Reken voorlopig af met de knop Bancontact.");
    throw new Error("CCV-koppeling wordt geactiveerd zodra CCV de API-gegevens bevestigt.");
  });
