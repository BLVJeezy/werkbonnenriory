import { billableHours, computeTotals } from "./billing";
import { formatSiteAddress, type SiteAddressParts } from "./address";

export type InvoiceLine = { description: string; quantity: number; unit: string; unitPrice: number; amount: number; vatRate?: number; discount?: number; originalUnitPrice?: number; group?: string; hidePrice?: boolean };
export type InvoiceCustomer = {
  name: string; address: string | null; siteAddress: string | null; vatNumber: string | null; email: string | null;
  street: string | null; houseNumber: string | null; postalCode: string | null; city: string | null;
};

type InvoiceWorkOrder = SiteAddressParts & {
  number: number | null; customer_name: string; address: string | null; street: string | null; house_number: string | null;
  postal_code: string | null; city: string | null; vat_number: string | null; email: string | null; billing_email: string | null;
  distance_km: number | null; warranty: boolean; vat_rate: number; paid_amount: number | null; paid_at: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: turns a signed work order into invoice lines and totals using the same billing rules as the app. */
export function buildInvoice(o: {
  wo: InvoiceWorkOrder; activity: { name: string; hourly_rate: number | null } | null; seconds: number;
  materials: { name: string; quantity: number; unit: string; unit_price: number }[]; kmRate: number;
}) {
  const { wo } = o;
  const rate = Number(o.activity?.hourly_rate ?? 0);
  const hours = Math.max(0, billableHours(o.seconds) - (wo.warranty ? 1 : 0));
  const km = wo.warranty ? 0 : Number(wo.distance_km ?? 0);
  const lines: InvoiceLine[] = [];
  if (hours > 0) lines.push({ description: `Arbeid${o.activity ? ` – ${o.activity.name}` : ""} (werkbon #${wo.number})${wo.warranty ? ", eerste uur onder garantie" : ""}`, quantity: hours, unit: "u", unitPrice: rate, amount: r2(hours * rate) });
  if (km > 0) lines.push({ description: "Verplaatsing (km heen en terug)", quantity: km, unit: "km", unitPrice: o.kmRate, amount: r2(km * o.kmRate) });
  for (const m of o.materials) lines.push({ description: m.name, quantity: Number(m.quantity), unit: m.unit, unitPrice: Number(m.unit_price), amount: r2(Number(m.quantity) * Number(m.unit_price)) });
  const t = computeTotals({ seconds: o.seconds, hourlyRate: rate, distanceKm: wo.distance_km, kmRate: o.kmRate, materials: o.materials, vatRate: Number(wo.vat_rate), warranty: wo.warranty });
  const customer: InvoiceCustomer = {
    name: wo.customer_name, address: wo.address, siteAddress: wo.use_site_address ? formatSiteAddress(wo) : null,
    vatNumber: wo.vat_number?.trim() || null, email: wo.billing_email?.trim() || wo.email?.trim() || null,
    street: wo.street, houseNumber: wo.house_number, postalCode: wo.postal_code, city: wo.city,
  };
  const paid = wo.paid_at ? Number(wo.paid_amount ?? 0) : 0;
  return { lines, customer, vatRate: Number(wo.vat_rate), net: t.net, vat: t.vat, total: t.total, paidAmount: paid };
}

/** Pure: credit note that reverses an existing invoice (negative lines and totals, same numbering sequence). */
export function buildCreditNote(inv: { lines: InvoiceLine[]; vatRate: number; net: number; vat: number; total: number }) {
  const lines = inv.lines.map((l) => ({ ...l, amount: -Math.abs(l.amount) }));
  return { lines, vatRate: inv.vatRate, net: -Math.abs(inv.net), vat: -Math.abs(inv.vat), total: -Math.abs(inv.total) };
}

/** Pure: free-form manual invoice lines with per-line VAT; used by the "Nieuwe factuur" form. */
export function buildManualInvoice(lines: { description: string; quantity: number; unit: string; unitPrice: number; vatRate: number; discount?: number; group?: string | null; hidePrice?: boolean }[]) {
  const rows: InvoiceLine[] = [];
  let net = 0, vat = 0;
  for (const l of lines) {
    const qty = Number(l.quantity) || 0;
    const price = Number(l.unitPrice) || 0;
    const rate = Number(l.vatRate) || 0;
    const disc = Math.min(100, Math.max(0, Number(l.discount) || 0));
    // Korting zit in de nettoprijs (UBL: aantal x prijs = bedrag); de lijstprijs blijft bewaard.
    const net1 = disc ? Math.round(price * (1 - disc / 100) * 1e6) / 1e6 : price;
    const amount = r2(qty * net1);
    const row: InvoiceLine = { description: l.description.trim(), quantity: qty, unit: l.unit.trim() || "st", unitPrice: net1, amount, vatRate: rate };
    if (disc) { row.discount = disc; row.originalUnitPrice = price; }
    const group = l.group?.trim();
    if (group) { row.group = group; if (l.hidePrice) row.hidePrice = true; }
    rows.push(row);
    net = r2(net + amount);
    vat = r2(vat + r2((amount * rate) / 100));
  }
  return { lines: rows, vatRate: rows[0]?.vatRate ?? 21, net, vat, total: r2(net + vat) };
}

/** Fully paid invoices may go out automatically; open ones always wait for a manual send. */
export function isFullyPaid(total: number, paidAmount: number) {
  return paidAmount > 0 && paidAmount + 0.005 >= total;
}

/** Belgian company number as Peppol participant id (scheme 0208), or null for non-BE / missing VAT numbers. */
export function peppolIdFromVat(vat: string | null | undefined): string | null {
  const d = (vat ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!d.startsWith("BE")) return null;
  const digits = d.slice(2);
  if (!/^\d{9,10}$/.test(digits)) return null;
  return `0208:${digits.padStart(10, "0")}`;
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pure: splits invoice lines into consecutive title sections with their summed net subtotal (lines without title form untitled sections). */
export function groupInvoiceLines(lines: InvoiceLine[]) {
  const sections: { title: string | null; hidePrice: boolean; subtotal: number; lines: InvoiceLine[] }[] = [];
  for (const l of lines) {
    const title = l.group?.trim() || null;
    const last = sections[sections.length - 1];
    if (last && last.title === title) { last.lines.push(l); last.subtotal = r2(last.subtotal + l.amount); continue; }
    sections.push({ title, hidePrice: !!(title && l.hidePrice), subtotal: l.amount, lines: [l] });
  }
  return sections;
}

/** An invoice may still be edited until any delivery leg (PDF mail, OkiOki, post) has gone out. */
export function isInvoiceEditable(inv: { kind: string; status: string; sent_at: string | null; pdf_sent_at: string | null; okioki_sent_at: string | null; post_sent_at?: string | null }) {
  return inv.kind !== "creditnota" && inv.status !== "verzonden" && !inv.sent_at && !inv.pdf_sent_at && !inv.okioki_sent_at && !inv.post_sent_at;
}
