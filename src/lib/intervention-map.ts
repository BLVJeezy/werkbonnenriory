import { destinationAddress, type AddressParts, type SiteAddressParts } from '@/lib/address';

export type Intervention = AddressParts & SiteAddressParts & {
  id: string; number: number | null; customer_name: string; address: string | null;
  status: string; signed_at: string | null; paid_at: string | null; scheduled_date: string | null;
  created_at: string; technician_id: string | null; activity_id: string | null;
  technicians: { name: string } | null; activities: { name: string } | null;
  no_invoice: boolean; subcontract_auto: boolean;
};
export type LocationCache = { address_key: string; lat: number | null; lon: number | null; state: string; source: string | null; error: string | null };
export type InterventionLocation = { key: string; address: string; customers: string[]; latest: string; orders: Intervention[]; cache: LocationCache | null; simpla?: SimplaLocation[] };
export type MapFilters = { from: string; until: string; crew: string; activity: string; status: string; search: string };
export const emptyMapFilters: MapFilters = { from: '', until: '', crew: '', activity: '', status: '', search: '' };

// Conservative normalization: retain house/unit numbers; never merge premises by postcode alone.
export function normalizeInterventionAddress(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('nl-BE')
    .replace(/(\d{4})\s+([a-z]{2})\b/g, '$1$2').replace(/[,.;\s]+/g, ' ').trim();
}
export function interventionDay(row: Intervention): string {
  if (row.scheduled_date) return row.scheduled_date;
  const value = row.signed_at ?? row.paid_at ?? row.created_at;
  return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
}
export function canAccessInterventionMap(role: string | null | undefined): boolean { return role === 'admin'; }
export function requireInterventionAdmin(isAdmin: boolean | null): void {
  if (!isAdmin) throw new Error('Alleen beheerders hebben toegang tot de interventiekaart.');
}
export function filterInterventions(rows: Intervention[], filters: MapFilters): Intervention[] {
  const needle = normalizeInterventionAddress(filters.search);
  return rows.filter(row => {
    if (row.status !== 'afgetekend') return false;
    const day = interventionDay(row);
    return (!filters.from || day >= filters.from) && (!filters.until || day <= filters.until)
      && (!filters.crew || row.technician_id === filters.crew) && (!filters.activity || row.activity_id === filters.activity)
      && (!filters.status || (filters.status === 'paid' ? !!row.paid_at : filters.status === 'unpaid' ? !row.paid_at : filters.status === 'no_invoice' ? row.no_invoice : filters.status === 'subcontract' ? row.subcontract_auto : true))
      && (!needle || normalizeInterventionAddress([destinationAddress(row), row.customer_name, row.number].join(' ')).includes(needle));
  });
}
export function groupInterventions(rows: Intervention[], caches: LocationCache[]): InterventionLocation[] {
  const cache = new Map(caches.map(c => [c.address_key, c]));
  const groups = new Map<string, InterventionLocation>();
  for (const row of rows) {
    if (row.status !== 'afgetekend') continue;
    const address = destinationAddress(row);
    // Unknown addresses stay separate, and must never become a pin at the customer's billing address.
    const key = address ? normalizeInterventionAddress(address) : `missing:${row.id}`;
    const group = groups.get(key) ?? { key, address: address ?? 'Interventieadres ontbreekt', customers: [], latest: '', orders: [], cache: cache.get(key) ?? null };
    if (!group.orders.some(order => order.id === row.id)) group.orders.push(row);
    if (!group.customers.includes(row.customer_name)) group.customers.push(row.customer_name);
    if (interventionDay(row) > group.latest) group.latest = interventionDay(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, orders: group.orders.sort((a,b) => interventionDay(b).localeCompare(interventionDay(a))) })).sort((a,b) => b.latest.localeCompare(a.latest));
}
// Google Geocoding response: only premises-level matches may become intervention pins.
export function pickPremisesLocation(payload: unknown): { lat: number; lon: number } | null {
  if (!payload || typeof payload !== 'object') return null;
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  for (const result of results) {
    const geometry = (result as { geometry?: unknown })?.geometry as { location?: { lat?: unknown; lng?: unknown }; location_type?: unknown } | undefined;
    const lat = geometry?.location?.lat; const lon = geometry?.location?.lng;
    if ((geometry?.location_type === 'ROOFTOP' || geometry?.location_type === 'RANGE_INTERPOLATED')
      && typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
      && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}
export function located(cache: LocationCache | null): cache is LocationCache & { lat: number; lon: number } {
  return cache?.state === 'located' && typeof cache.lat === 'number' && typeof cache.lon === 'number' && Number.isFinite(cache.lat) && Number.isFinite(cache.lon) && Math.abs(cache.lat) <= 90 && Math.abs(cache.lon) <= 180;
}
// Historische Simpla-klantadressen (op uitdrukkelijke vraag van de beheerder mee op de kaart).
export type SimplaCustomerRow = { customerId?: number; customerName?: string; customerStreetNr?: string | null; customerPostal?: string | null; customerCity?: string | null; deliveryStreetNr?: string | null; deliveryPostal?: string | null; deliveryCity?: string | null };
export type SimplaBillRow = { billCustomerId?: number; billDate?: string | null };
export type SimplaLocation = { ref: string; source: 'simpla' | 'project'; key: string; address: string; customer: string; latest: string; bills: number };
function joinAddress(street?: string | null, postal?: string | null, city?: string | null): string | null {
  const st = street?.trim() ?? ''; const place = [postal, city].map(v => v?.trim() ?? '').filter(Boolean).join(' ');
  // Zonder straat is er geen exact adres: een gemeente alleen wordt nooit een pin.
  return st && place ? `${st}, ${place}` : null;
}
/** Factuuradres en (indien anders) leveringsadres van een Simpla-klant. */
export function simplaAddresses(c: SimplaCustomerRow): { kind: 'f' | 'l'; address: string }[] {
  const out: { kind: 'f' | 'l'; address: string }[] = [];
  const billing = joinAddress(c.customerStreetNr, c.customerPostal, c.customerCity); if (billing) out.push({ kind: 'f', address: billing });
  const delivery = joinAddress(c.deliveryStreetNr, c.deliveryPostal, c.deliveryCity);
  if (delivery && (!billing || normalizeInterventionAddress(delivery) !== normalizeInterventionAddress(billing))) out.push({ kind: 'l', address: delivery });
  return out;
}
export function buildSimplaLocations(customers: SimplaCustomerRow[], bills: SimplaBillRow[]): SimplaLocation[] {
  const stats = new Map<number, { latest: string; bills: number }>();
  for (const b of bills) { if (typeof b.billCustomerId !== 'number') continue; const s = stats.get(b.billCustomerId) ?? { latest: '', bills: 0 }; s.bills++; const d = (b.billDate ?? '').slice(0, 10); if (d > s.latest) s.latest = d; stats.set(b.billCustomerId, s); }
  const out: SimplaLocation[] = [];
  for (const c of customers) {
    if (typeof c.customerId !== 'number') continue;
    const s = stats.get(c.customerId) ?? { latest: '', bills: 0 };
    for (const a of simplaAddresses(c)) out.push({ ref: `s:${c.customerId}:${a.kind}`, source: 'simpla', key: normalizeInterventionAddress(a.address), address: a.address, customer: c.customerName?.trim() || 'Simpla-klant', latest: s.latest, bills: s.bills });
  }
  return out;
}
export type ProjectRow = { id: string; name: string; street: string | null; house_number: string | null; postal_code: string | null; city: string | null; created_at: string; customers?: { name: string | null } | null };
export function buildProjectLocations(rows: ProjectRow[]): SimplaLocation[] {
  const out: SimplaLocation[] = [];
  for (const p of rows) {
    const address = joinAddress([p.street, p.house_number].map(v => v?.trim() ?? '').filter(Boolean).join(' '), p.postal_code, p.city); if (!address) continue;
    out.push({ ref: `p:${p.id}`, source: 'project', key: normalizeInterventionAddress(address), address, customer: p.customers?.name?.trim() || p.name, latest: (p.created_at ?? '').slice(0, 10), bills: 0 });
  }
  return out;
}
/** Voegt Simpla-adressen samen met werkbonlocaties op hetzelfde genormaliseerde adres. Ploeg-, activiteit- en statusfilters gelden enkel voor werkbonnen. */
export function mergeSimplaLocations(groups: InterventionLocation[], simpla: SimplaLocation[], caches: LocationCache[], filters: MapFilters): InterventionLocation[] {
  if (filters.crew || filters.activity || filters.status) return groups;
  const cache = new Map(caches.map(c => [c.address_key, c])); const byKey = new Map(groups.map(g => [g.key, { ...g }]));
  const needle = normalizeInterventionAddress(filters.search);
  for (const s of simpla) {
    if ((filters.from || filters.until) && (!s.latest || (filters.from && s.latest < filters.from) || (filters.until && s.latest > filters.until))) continue;
    if (needle && !normalizeInterventionAddress(`${s.address} ${s.customer}`).includes(needle)) continue;
    const g = byKey.get(s.key) ?? { key: s.key, address: s.address, customers: [], latest: '', orders: [], cache: cache.get(s.key) ?? null, simpla: [] };
    g.simpla = [...(g.simpla ?? []), s];
    if (!g.customers.includes(s.customer)) g.customers.push(s.customer);
    if (s.latest > g.latest) g.latest = s.latest;
    byKey.set(s.key, g);
  }
  return [...byKey.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}
export function locationCount(l: InterventionLocation): number { return l.orders.length + (l.simpla ?? []).reduce((n, s) => n + Math.max(1, s.bills), 0); }
