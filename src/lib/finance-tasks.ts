import { supabase } from "@/integrations/supabase/client";
import { evaluateFinance } from "@/lib/finance-eval";

// Browservariant: draait als de aangemelde gebruiker onder rijbeveiliging.
export async function syncFinanceTasks(companyId: string) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Niet aangemeld");
  return evaluateFinance(supabase as any, u.user.id, companyId);
}
