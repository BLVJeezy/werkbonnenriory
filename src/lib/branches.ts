export type BranchPoint = { id: string; name: string; lat: number | null; lon: number | null; active: boolean; dutch_billing?: boolean };

/** Hemelsbrede afstand in km tussen twee punten. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Actieve vestigingen met coördinaten, gesorteerd van dichtst naar verst t.o.v. de bestemming [lon, lat]. */
export function branchesByProximity<T extends BranchPoint>(branches: T[], dest: [number, number]): T[] {
  return branches
    .filter((b) => b.active && b.lat != null && b.lon != null)
    .map((b) => ({ b, d: haversineKm([b.lon as number, b.lat as number], dest) }))
    .sort((x, y) => x.d - y.d)
    .map((x) => x.b);
}

export function branchAddress(b: { street?: string | null; house_number?: string | null; postal_code?: string | null; city?: string | null }): string {
  return `${[b.street, b.house_number].filter(Boolean).join(" ")}, ${[b.postal_code, b.city].filter(Boolean).join(" ")}`.trim();
}
