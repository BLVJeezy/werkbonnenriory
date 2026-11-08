export type ProductLine = { name: string; quantity: number; amount: number };
export type ProductGroup = { key: string; label: string; match: (name: string) => boolean };

const n = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Vaste dashboardgroepen: drie camera-inspecties apart, septische put, alle regenputreinigingen, riostoppen. */
export const PRODUCT_GROUPS: ProductGroup[] = [
  { key: "cam32", label: "Camera-inspectie 32-50", match: (s) => n(s).includes("camera-inspectie 32-50") },
  { key: "cam75", label: "Camera-inspectie 75-110", match: (s) => n(s).includes("camera-inspectie 75-110") },
  { key: "cam125", label: "Camera-inspectie 125-250", match: (s) => n(s).includes("camera-inspectie 125-250") },
  { key: "septisch", label: "Ledigen septische put", match: (s) => n(s).includes("septische") },
  { key: "regenput", label: "Reiniging regenputten", match: (s) => /regen(water)?put/.test(n(s)) && n(s).includes("reiniging") },
  { key: "riostop", label: "Riostoppen / inspectiepunten", match: (s) => n(s).includes("riostop") || n(s).includes("inspectiepunt") },
];

export function productRevenue(lines: ProductLine[], groups = PRODUCT_GROUPS) {
  return groups.map((g) => {
    const hit = lines.filter((l) => g.match(l.name));
    return {
      key: g.key, label: g.label,
      quantity: hit.reduce((s, l) => s + l.quantity, 0),
      amount: Math.round(hit.reduce((s, l) => s + l.amount, 0) * 100) / 100,
    };
  });
}
