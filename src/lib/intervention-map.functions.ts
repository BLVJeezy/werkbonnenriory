import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { destinationAddress } from '@/lib/address';
import { buildSimplaLocations, normalizeInterventionAddress, pickPremisesLocation, requireInterventionAdmin, type Intervention, type SimplaLocation } from './intervention-map';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';
function geocoderConfig() {
  const apiKey = process.env['GOOGLE_MAPS_API_KEY'];
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const budget = Number(process.env['INTERVENTION_GEOCODER_DAILY_LIMIT'] || 3500);
  const configured = !!apiKey && !!lovableKey && Number.isInteger(budget) && budget > 0 && budget <= 5000;
  return { apiKey, lovableKey, budget, configured };
}

const projection = 'id,number,customer_name,address,street,house_number,postal_code,city,use_site_address,site_street,site_house_number,site_postal_code,site_city,status,signed_at,paid_at,scheduled_date,created_at,technician_id,activity_id,no_invoice,subcontract_auto,technicians(name),activities(name)' as const;

export const getInterventionPage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ offset: z.number().int().min(0) }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error) throw new Error('Toegang kon niet gecontroleerd worden.');
    requireInterventionAdmin(role.data);
    const result = await context.supabase.from('work_orders').select(projection).eq('status', 'afgetekend').order('id').range(data.offset, data.offset + 499);
    if (result.error) throw new Error(result.error.message);
    const rows: Intervention[] = result.data ?? [];
    const keys = [...new Set(rows.map(row => destinationAddress(row)).filter((value): value is string => !!value).map(normalizeInterventionAddress))];
    const cache = keys.length ? await context.supabase.from('intervention_locations').select('address_key,lat,lon,state,source,error').in('address_key', keys) : { data: [], error: null };
    if (cache.error) throw new Error(cache.error.message);
    const { configured, budget } = geocoderConfig();
    return { rows, caches: cache.data ?? [], next: rows.length === 500 ? data.offset + 500 : null, configured, budget: configured ? budget : 0 };
  });

export const saveInterventionCoordinates = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180) }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error) throw new Error('Toegang kon niet gecontroleerd worden.');
    requireInterventionAdmin(role.data);
    const row = await context.supabase.from('work_orders').select(projection).eq('id', data.id).eq('status', 'afgetekend').single();
    if (row.error) throw new Error('Werkbon niet beschikbaar.');
    const address = destinationAddress(row.data);
    if (!address) throw new Error('Vul eerst het interventieadres op de werkbon aan.');
    const result = await context.supabase.from('intervention_locations').upsert({ address_key: normalizeInterventionAddress(address), address, lat: data.lat, lon: data.lon, state: 'located', source: 'manual', error: null, lease_until: null, updated_at: new Date().toISOString() });
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

// Alleen-lezen Simpla-klantadressen; kort in het geheugen bewaard zodat herhaalde opzoekreeksen Simpla niet telkens bevragen.
let simplaMemo: { at: number; rows: SimplaLocation[] } | null = null;
async function loadSimplaLocations(): Promise<SimplaLocation[]> {
  if (simplaMemo && Date.now() - simplaMemo.at < 10 * 60_000) return simplaMemo.rows;
  const token = process.env['SIMPLA_API_TOKEN'];
  if (!token) throw new Error('Simpla-token ontbreekt');
  const get = async (dataType: string) => {
    const url = new URL('https://app-02.simpla.be/api/'); url.searchParams.set('token', token); url.searchParams.set('dataType', dataType);
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) }).catch(() => { throw new Error(`Simpla ${dataType}: verbinding mislukt`); });
    if (!res.ok) throw new Error(`Simpla ${dataType} mislukt (HTTP ${res.status})`);
    const j = await res.json() as { status?: string; data?: unknown[] };
    if (j.status !== 'OK' || !Array.isArray(j.data)) throw new Error(`Simpla gaf geen geldige ${dataType}`);
    return j.data as never[];
  };
  const [customers, bills] = await Promise.all([get('customer'), get('bill_sale')]);
  const rows = buildSimplaLocations(customers, bills); simplaMemo = { at: Date.now(), rows }; return rows;
}

export const getSimplaMapLocations = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error) throw new Error('Toegang kon niet gecontroleerd worden.');
    requireInterventionAdmin(role.data);
    try {
      const rows = await loadSimplaLocations();
      const keys = [...new Set(rows.map(r => r.key))]; const caches = [];
      for (let i = 0; i < keys.length; i += 150) {
        const res = await context.supabase.from('intervention_locations').select('address_key,lat,lon,state,source,error').in('address_key', keys.slice(i, i + 150));
        if (res.error) throw new Error(res.error.message); caches.push(...(res.data ?? []));
      }
      return { rows, caches, error: null as string | null };
    } catch (e) { return { rows: [] as SimplaLocation[], caches: [], error: e instanceof Error ? e.message : 'Simpla niet bereikbaar' }; }
  });

export const geocodeInterventionBatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ids: z.array(z.string().uuid()).max(25).default([]), simplaIds: z.array(z.number().int().positive()).max(25).default([]) }).refine(v => v.ids.length + v.simplaIds.length >= 1 && v.ids.length + v.simplaIds.length <= 25).parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error) throw new Error('Toegang kon niet gecontroleerd worden.');
    requireInterventionAdmin(role.data);
    const { apiKey, lovableKey, budget, configured } = geocoderConfig();
    if (!configured || !apiKey || !lovableKey) throw new Error('Google Maps is niet gekoppeld of het dagbudget is ongeldig. Handmatige coördinaten blijven mogelijk.');
    const addresses = new Map<string,string>();
    if (data.ids.length) {
      const rows = await context.supabase.from('work_orders').select(projection).eq('status', 'afgetekend').in('id', data.ids);
      if (rows.error) throw new Error(rows.error.message);
      for (const row of rows.data ?? []) { const address = destinationAddress(row); if (address) addresses.set(normalizeInterventionAddress(address), address); }
    }
    if (data.simplaIds.length) {
      // Adressen komen van de server zelf (Simpla), nooit uit de browser.
      const wanted = new Set(data.simplaIds);
      for (const s of await loadSimplaLocations()) if (wanted.has(s.id)) addresses.set(s.key, s.address);
    }
    let found = 0; let failed = 0; let stopped: string | null = null;
    for (const [addressKey, address] of addresses) {
      const claim = await context.supabase.rpc('claim_intervention_geocode', { p_key: addressKey, p_address: address, p_budget: budget });
      if (claim.error) throw new Error(claim.error.message);
      if (claim.data === 'cached') continue;
      if (claim.data !== 'claimed') { stopped = claim.data; break; }
      try {
        const response = await fetch(`${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=be`, { headers: { Authorization: `Bearer ${lovableKey}`, 'X-Connection-Api-Key': apiKey }, signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (!response.ok) throw new Error(`Adreszoekdienst gaf fout ${response.status}.`);
        // Premises-level matches only; postcode/city-centroid results cannot become intervention pins.
        const hit = pickPremisesLocation(await response.json());
        if (!hit) throw new Error('Geen exact adres gevonden.');
        const saved = await context.supabase.from('intervention_locations').update({ lat: hit.lat, lon: hit.lon, state: 'located', source: 'google', error: null, lease_until: null, updated_at: new Date().toISOString() }).eq('address_key', addressKey).eq('state', 'processing');
        if (saved.error) throw new Error(saved.error.message);
        found++;
      } catch {
        const saved = await context.supabase.from('intervention_locations').update({ state: 'failed', error: 'Geen exact adres gevonden of adreszoekdienst niet beschikbaar.', lease_until: null, updated_at: new Date().toISOString() }).eq('address_key', addressKey).eq('state', 'processing');
        if (saved.error) throw new Error(saved.error.message);
        failed++;
      }
      await new Promise(resolve => setTimeout(resolve, 220));
    }
    return { found, failed, stopped };
  });