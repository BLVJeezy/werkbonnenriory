import { destinationAddress, type AddressParts, type SiteAddressParts } from '@/lib/address';

export type Intervention = AddressParts & SiteAddressParts & {
  id: string; number: number | null; customer_name: string; address: string | null;
  status: string; signed_at: string | null; paid_at: string | null; scheduled_date: string | null;
  created_at: string; technician_id: string | null; activity_id: string | null;
  technicians: { name: string } | null; activities: { name: string } | null;
  no_invoice: boolean; subcontract_auto: boolean;
};
export type LocationCache = { address_key: string; lat: number | null; lon: number | null; state: string; source: string | null; error: string | null };
export type InterventionLocation = { key: string; address: string; customers: string[]; latest: string; orders: Intervention[]; cache: LocationCache | null };
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
export function located(cache: LocationCache | null): cache is LocationCache & { lat: number; lon: number } {
  return cache?.state === 'located' && typeof cache.lat === 'number' && typeof cache.lon === 'number' && Number.isFinite(cache.lat) && Number.isFinite(cache.lon) && Math.abs(cache.lat) <= 90 && Math.abs(cache.lon) <= 180;
}