import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { destinationAddress } from "@/lib/address";

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

/** Round-trip driving km from the base address to a destination address. */
async function roundTripKm(destination: string, baseAddress: string): Promise<number | null> {
  const [a, b] = await Promise.all([geocode(baseAddress), geocode(destination)]);
  if (!a || !b) return null;
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.join(",")};${b.join(",")}?overview=false`, {
    headers: { "User-Agent": UA },
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { routes?: { distance: number }[] };
  const meters = j.routes?.[0]?.distance;
  if (meters == null) return null;
  return Math.round((meters * 2) / 100) / 10;
}

/** Round-trip driving km from the base address to the customer, stored on the work order. */
export const computeDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wo } = await context.supabase.from("work_orders").select("address, use_site_address, site_street, site_house_number, site_postal_code, site_city").eq("id", data.id).single();
    const { data: s } = await context.supabase.from("settings").select("base_address").eq("id", 1).single();
    const destination = wo ? destinationAddress(wo) : null;
    if (!destination || !s) return { km: null };
    const km = await roundTripKm(destination, s.base_address);
    if (km != null) await context.supabase.from("work_orders").update({ distance_km: km }).eq("id", data.id);
    return { km };
  });

/** Round-trip driving km to an arbitrary address, for quotes (nothing is stored). */
export const quoteDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ address: z.string().min(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Alleen voor beheerder");
    const { data: s } = await context.supabase.from("settings").select("base_address").eq("id", 1).single();
    if (!s) return { km: null };
    return { km: await roundTripKm(data.address, s.base_address) };
  });
