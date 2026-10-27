import { formatSiteAddress, type SiteAddressParts } from "./address";

type MailWorkOrder = SiteAddressParts & {
  number: number; customer_name: string; address: string | null;
  description: string | null; signed_at: string | null; signed_name: string | null;
  distance_km: number | null; warranty: boolean;
};

/** Explicit allowlist: customer mail never receives financial fields. */
export function werkbonMailData(wo: MailWorkOrder, activity: string | null, seconds: number, materials: { name: string; quantity: number; unit: string }[]) {
  return {
    number: wo.number, customer: wo.customer_name, address: wo.address,
    siteAddress: wo.use_site_address ? formatSiteAddress(wo) : null,
    description: wo.description, signedAt: wo.signed_at, signedName: wo.signed_name,
    activity, seconds, distanceKm: wo.distance_km, warranty: wo.warranty,
    materials: materials.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
  };
}

export function renderWerkbonMail(data: ReturnType<typeof werkbonMailData>) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const row = (label: string, value: string) => `<tr><td style="padding:4px 12px 4px 0">${label}</td><td style="padding:4px 0">${esc(value)}</td></tr>`;
  const minutes = Math.round(data.seconds / 60);
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
<h1>Werkbon #${data.number}</h1><p>Riory — bedankt voor uw vertrouwen.</p><table>
${row("Klant", data.customer)}
${data.address ? row("Klantadres", data.address) : ""}
${data.siteAddress ? row("Werfadres", data.siteAddress) : ""}
${data.activity ? row("Activiteit", data.activity) : ""}
${data.signedAt ? row("Datum", new Date(data.signedAt).toLocaleString("nl-BE")) : ""}
${data.description ? row("Omschrijving", data.description) : ""}
${row("Gewerkte tijd", `${Math.floor(minutes / 60)} u ${minutes % 60} min`)}
${data.distanceKm != null ? row("Kilometers heen en terug", `${data.distanceKm.toLocaleString("nl-BE")} km`) : ""}
${data.warranty ? row("Onder garantie", "Ja") : ""}</table>
${data.materials.length ? `<h2>Materialen</h2><table>${data.materials.map((m) => row(m.name, `${m.quantity} ${m.unit}`)).join("")}</table>` : ""}
${data.signedName ? `<p>Afgetekend door ${esc(data.signedName)}.</p>` : "<p>Afgesloten.</p>"}
<p>Met vriendelijke groeten,<br>Riory</p></body></html>`;
}