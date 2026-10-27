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

/** Round-trip driving km from the base address to the customer, stored on the work order. */
export const computeDistance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: wo } = await context.supabase.from("work_orders").select("address, use_site_address, site_street, site_house_number, site_postal_code, site_city").eq("id", data.id).single();
    const { data: s } = await context.supabase.from("settings").select("base_address").eq("id", 1).single();
    const destination = wo ? destinationAddress(wo) : null;
    if (!destination || !s) return { km: null };
    const [a, b] = await Promise.all([geocode(s.base_address), geocode(destination)]);
    if (!a || !b) return { km: null };
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.join(",")};${b.join(",")}?overview=false`, {
      headers: { "User-Agent": UA },
    });
    if (!r.ok) return { km: null };
    const j = (await r.json()) as { routes?: { distance: number }[] };
    const meters = j.routes?.[0]?.distance;
    if (meters == null) return { km: null };
    const km = Math.round((meters * 2) / 100) / 10;
    await context.supabase.from("work_orders").update({ distance_km: km }).eq("id", data.id);
    return { km };
  });
