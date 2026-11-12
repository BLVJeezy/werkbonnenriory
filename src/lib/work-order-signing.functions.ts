import { createServerFn } from "@tanstack/react-start";
import { formatSiteAddress } from "@/lib/address";

/** Price-free DTO for the public signing page: no rates, no amounts. */
export type WerkbonSigningView = {
  number: number | null;
  customer: string;
  address: string | null;
  siteAddress: string | null;
  description: string | null;
  workNotes: string | null;
  activity: string | null;
  minutes: number;
  distanceKm: number | null;
  warranty: boolean;
  materials: { name: string; quantity: number; unit: string }[];
  signed: boolean;
  signedName: string | null;
  signedAt: string | null;
};

const CODE_PATTERN = /^[A-Z2-9]{12}$/;

async function loadByCode(id: string, rawCode: string) {
  const code = String(rawCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!CODE_PATTERN.test(code)) throw new Error("Ongeldige code");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: wo } = await supabaseAdmin
    .from("work_orders")
    .select("id, number, customer_name, address, street, house_number, postal_code, city, use_site_address, site_street, site_house_number, site_postal_code, site_city, description, work_notes, activity_id, distance_km, warranty, status, signature, signed_name, signed_at, signing_code")
    .eq("id", id)
    .maybeSingle();
  if (!wo || !wo.signing_code || wo.signing_code !== code) throw new Error("Ongeldige code of link");
  return { supabaseAdmin, wo };
}

export const getWerkbonForSigning = createServerFn({ method: "GET" })
  .inputValidator((i: { id: string; code: string }) => i)
  .handler(async ({ data }): Promise<WerkbonSigningView> => {
    const { supabaseAdmin, wo } = await loadByCode(data.id, data.code);
    const [t, m, acts] = await Promise.all([
      supabaseAdmin.from("time_entries").select("started_at, ended_at").eq("work_order_id", wo.id),
      supabaseAdmin.from("materials").select("name, quantity, unit").eq("work_order_id", wo.id).order("created_at"),
      supabaseAdmin.from("activities").select("id, name"),
    ]);
    const seconds = (t.data ?? []).reduce(
      (s, e) => s + (e.ended_at ? (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000 : 0),
      0,
    );
    return {
      number: wo.number,
      customer: wo.customer_name,
      address: wo.address,
      siteAddress: wo.use_site_address ? formatSiteAddress(wo) : null,
      description: wo.description,
      workNotes: wo.work_notes ?? null,
      activity: (acts.data ?? []).find((a) => a.id === wo.activity_id)?.name ?? null,
      minutes: Math.round(seconds / 60),
      distanceKm: wo.distance_km,
      warranty: wo.warranty,
      materials: (m.data ?? []).map((x) => ({ name: x.name, quantity: Number(x.quantity), unit: x.unit })),
      signed: Boolean(wo.signature),
      signedName: wo.signed_name,
      signedAt: wo.signed_at,
    };
  });

export const signWerkbonWithCode = createServerFn({ method: "POST" })
  .inputValidator((i: { id: string; code: string; signature: string; name: string }) => {
    if (!i.signature.startsWith("data:image/png")) throw new Error("Handtekening ontbreekt");
    if (!i.name.trim()) throw new Error("Vul je naam in");
    return { id: i.id, code: i.code, signature: i.signature, name: i.name.trim() };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin, wo } = await loadByCode(data.id, data.code);
    if (wo.status !== "afgetekend") throw new Error("Deze werkbon is nog niet afgerond");
    if (wo.signature) return { ok: true as const };
    const { error } = await supabaseAdmin
      .from("work_orders")
      .update({ signature: data.signature, signed_name: data.name, signed_at: new Date().toISOString() })
      .eq("id", wo.id)
      .is("signature", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
