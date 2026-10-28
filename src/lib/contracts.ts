import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatAddress } from "@/lib/address";
import { vatRateForCustomer } from "@/lib/vat-number";
import { isoDate, occurrencesUntil, type RepeatUnit } from "@/lib/recurrence";

/** Hoe ver vooruit terugkerende contracttaken in de agenda gezet worden. */
export const PLAN_AHEAD_DAYS = 56;

/** Zet alle contractbeurten tot de horizon als taak in de agenda. Dubbels worden door de database geweigerd. */
export async function planContracts(sb: SupabaseClient<Database>) {
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + PLAN_AHEAD_DAYS);
  const until = isoDate(horizon);
  const { data: contracts, error } = await sb.from("contracts").select("*, customers(*)").eq("active", true).eq("scheduling_ready", true).lte("next_date", until);
  if (error) throw error;
  let created = 0;
  for (const c of contracts ?? []) {
    const { dates, next } = occurrencesUntil(c.next_date, c.repeat_every, c.repeat_unit as RepeatUnit, until, c.end_date, c.repeat_ordinal, c.repeat_weekday);
    const k = c.customers;
    for (const date of dates) {
      const { error: e } = await sb.from("work_orders").insert({
        contract_id: c.id,
        scheduled_date: date,
        customer_id: c.customer_id,
        customer_name: k?.name ?? c.customer_name,
        street: k?.street ?? null,
        house_number: k?.house_number ?? null,
        postal_code: k?.postal_code ?? null,
        city: k?.city ?? null,
        address: k ? formatAddress(k) : null,
        phone: k?.phone ?? null,
        email: k?.email ?? null,
        billing_email: k?.billing_email ?? null,
        vat_number: k?.vat_number ?? null,
        vat_rate: vatRateForCustomer(k?.vat_number ?? "", Number(k?.default_vat_rate ?? 21)),
        project_name: c.name,
        description: c.description,
        technician_id: c.technician_id,
        activity_id: c.activity_id,
        status: c.technician_id ? "toegewezen" : "nieuw",
      });
      if (!e) created++;
      else if (e.code !== "23505") throw e;
    }
    const { error: advanceError } = await sb.from("contracts").update({ next_date: next }).eq("id", c.id).eq("next_date", c.next_date);
    if (advanceError) throw advanceError;
  }
  return created;
}
