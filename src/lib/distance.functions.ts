import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { destinationAddress } from "@/lib/address";
import { branchAddress, branchesByProximity } from "@/lib/branches";

const UA = "RioryWerkbonnen/1.0 (info@riory.be)";

async function geocodeOnce(q: string): Promise<[number, number] | null> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=be,nl&q=${encodeURIComponent(q)}`,
    { headers: { "User-Agent": UA } },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { lat: string; lon: string }[];
  return j[0] ? [Number(j[0].lon), Number(j[0].lat)] : null;
}

/** Tries the full address, then without "bus/bte" suffixes, then without house number, then just postcode + city. */
async function geocode(q: string): Promise<[number, number] | null> {
  const noBus = q.replace(/\s*(bus|bte|boîte|box)\s*\S+/gi, "").replace(/(\d+)\s*[a-z]?\s*\/\s*\S+/gi, "$1");
  const [street, ...rest] = noBus.split(",");
  const city = rest.join(",").trim();
  const noNumber = `${(street ?? "").replace(/\s*\d+\S*\s*$/, "")}, ${city}`;
  for (const c of [...new Set([q, noBus, noNumber, city].filter(Boolean))]) {
    const hit = await geocodeOnce(c);
    if (hit) return hit;
  }
  return null;
}

async function routeKm(a: [number, number], b: [number, number]): Promise<number | null> {
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.join(",")};${b.join(",")}?overview=false`, {
    headers: { "User-Agent": UA },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { routes?: { distance: number }[] };
  const meters = j.routes?.[0]?.distance;
  if (meters == null) return null;
  return Math.round((meters * 2) / 100) / 10;
}

type Origin = { km: number | null; branchId: string | null; branchName: string | null };

/**
 * Round-trip km vanaf de dichtstbijzijnde actieve vestiging (rijafstand van de twee
 * hemelsbreed dichtste vergeleken). Zonder vestigingen: het algemene vertrekadres.
 */
async function nearestOrigin(supabase: any, destination: string, forcedBranchId?: string | null): Promise<Origin> {
  const b = await geocode(destination);
  if (!b) return { km: null, branchId: null, branchName: null };
  const { data: branches } = await supabase.from("branches").select("id, name, lat, lon, active, dutch_billing");
  const all = (branches ?? []) as { id: string; name: string; lat: number | null; lon: number | null; active: boolean }[];
  const forced = forcedBranchId ? all.find((x) => x.id === forcedBranchId && x.lat != null) : undefined;
  const candidates = forced ? [forced] : branchesByProximity(all, b).slice(0, 2);
  if (candidates.length) {
    let best: Origin = { km: null, branchId: null, branchName: null };
    for (const c of candidates) {
      const km = await routeKm([c.lon as number, c.lat as number], b);
      if (km != null && (best.km == null || km < best.km)) best = { km, branchId: c.id, branchName: c.name };
    }
    return best;
  }
  const { data: s } = await supabase.from("settings").select("base_address").eq("id", 1).single();
  const a = s ? await geocode(s.base_address) : null;
  return { km: a ? await routeKm(a, b) : null, branchId: null, branchName: null };
}

/** Round-trip km vanaf de dichtstbijzijnde vestiging, bewaard op de werkbon; klant krijgt het vestigingslabel. */
export const computeDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wo } = await context.supabase.from("work_orders").select("address, use_site_address, site_street, site_house_number, site_postal_code, site_city, customer_id, customers(branch_id, branch_manual)").eq("id", data.id).single();
    const destination = wo ? destinationAddress(wo) : null;
    if (!destination || !wo) return { km: null, branch: null };
    const cust = (wo as any).customers as { branch_id: string | null; branch_manual: boolean } | null;
    const o = await nearestOrigin(context.supabase, destination, cust?.branch_manual ? cust.branch_id : null);
    if (o.km != null) await context.supabase.from("work_orders").update({ distance_km: o.km, branch_id: o.branchId }).eq("id", data.id);
    if (o.branchId && wo.customer_id && !cust?.branch_manual) await context.supabase.from("customers").update({ branch_id: o.branchId }).eq("id", wo.customer_id);
    return { km: o.km, branch: o.branchName };
  });

/** Round-trip km naar een willekeurig adres, voor offertes (niets bewaard). */
export const quoteDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ address: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Alleen voor beheerder");
    const o = await nearestOrigin(context.supabase, data.address);
    return { km: o.km, branch: o.branchName };
  });

/** Admin: coördinaten van een vestiging opzoeken en bewaren. */
export const geocodeBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Alleen voor beheerder");
    const { data: b } = await context.supabase.from("branches").select("street, house_number, postal_code, city").eq("id", data.id).single();
    const hit = b ? await geocode(branchAddress(b)) : null;
    if (!hit) return { ok: false };
    await context.supabase.from("branches").update({ lon: hit[0], lat: hit[1] }).eq("id", data.id);
    return { ok: true };
  });

/** Admin: alle bestaande klanten zonder handmatige keuze aan de dichtstbijzijnde vestiging koppelen (hemelsbreed, per reeks). */
export const assignCustomerBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offset: z.number().int().min(0) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Alleen voor beheerder");
    const { data: branches } = await context.supabase.from("branches").select("id, name, lat, lon, active");
    if (!branchesByProximity(branches ?? [], [5.5, 50.9]).length) throw new Error("Nog geen actieve vestiging met gekend adres.");
    const size = 15;
    const { data: rows } = await context.supabase.from("customers").select("id, street, house_number, postal_code, city").eq("branch_manual", false).order("id").range(data.offset, data.offset + size - 1);
    let assigned = 0;
    for (const c of rows ?? []) {
      if (!c.postal_code && !c.city) continue;
      const hit = await geocode(branchAddress(c));
      const best = hit ? branchesByProximity(branches ?? [], hit)[0] : undefined;
      if (best) { await context.supabase.from("customers").update({ branch_id: best.id }).eq("id", c.id); assigned++; }
    }
    return { assigned, done: (rows ?? []).length < size, next: data.offset + size };
  });
