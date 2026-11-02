// Verzekeringsverslag uit een afgetekende werkbon: alle werkboninfo wordt overgenomen in een duidelijke tekst.
type Wo = {
  number?: number | null; customer_name: string; address?: string | null; project_name?: string | null;
  description?: string | null; work_notes?: string | null; scheduled_date?: string | null;
  signed_name?: string | null; signed_at?: string | null; warranty?: boolean | null;
  use_site_address?: boolean | null; site_street?: string | null; site_house_number?: string | null; site_postal_code?: string | null; site_city?: string | null;
};

const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("nl-BE", { timeZone: "Europe/Brussels" }) : null);

export function insuranceReport(wo: Wo, o: { crew?: string | null; activity?: string | null; hours: number; materials: { name: string; quantity: number; unit: string }[]; photoCount: number }) {
  const site = wo.use_site_address
    ? [[wo.site_street, wo.site_house_number].filter(Boolean).join(" "), [wo.site_postal_code, wo.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : wo.address ?? "";
  const facts: [string, string | null | undefined][] = [
    ["Werkbon", wo.number ? `#${wo.number}` : null],
    ["Project", wo.project_name],
    ["Klant", wo.customer_name],
    ["Adres van de schade", site || null],
    ["Datum interventie", d(wo.signed_at) ?? d(wo.scheduled_date)],
    ["Uitgevoerd door", o.crew],
    ["Activiteit", o.activity],
    ["Gewerkte tijd", o.hours > 0 ? `${o.hours.toLocaleString("nl-BE")} u` : null],
    ["Afgetekend door", wo.signed_name ? `${wo.signed_name}${wo.signed_at ? ` op ${d(wo.signed_at)}` : ""}` : null],
    ["Foto's", o.photoCount ? `${o.photoCount} foto's in bijlage` : null],
  ];
  const intro = ["VERSLAG VOOR DE VERZEKERING", "", ...facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].join("\n");
  const findings = [
    (wo.description ?? "").trim() && `Melding en uitgevoerde werken:\n${(wo.description ?? "").trim()}`,
    (wo.work_notes ?? "").trim() && `Opmerkingen van de ploeg:\n${(wo.work_notes ?? "").trim()}`,
    o.materials.length && `Gebruikte materialen:\n${o.materials.map((m) => `- ${m.quantity} ${m.unit} ${m.name}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  return { intro, findings: findings || null };
}
