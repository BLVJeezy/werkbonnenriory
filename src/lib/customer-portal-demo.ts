/**
 * Demo content for the customer portal test account only. Nothing here is stored in the
 * database: the overview appends these items in memory and the PDFs are generated on the fly,
 * so Riory's planning, invoicing and figures never see them. Remove by emptying DEMO_EMAILS.
 */
import { createInvoicePdf } from "./invoice-pdf";
import { createWerkbonPdf } from "./werkbon-pdf";

export const DEMO_EMAILS = ["jasonbalongo@gmail.com"];
export const DEMO_PREFIX = "demo-";

export function portalDemoEnabled(email: string, preview: boolean): boolean {
  return !preview && DEMO_EMAILS.includes(email);
}

const ADDRESS = "Voorbeeldstraat 1, 3700 Tongeren";

function day(offset: number, now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function demoWorkOrders(now = new Date()) {
  const base = {
    projectName: null,
    address: ADDRESS,
    urgent: false,
    scheduledFrom: null as string | null,
    scheduledUntil: null as string | null,
    signedAt: null as string | null,
    hasPdf: false,
  };
  return [
    {
      ...base,
      id: `${DEMO_PREFIX}wo-aangevraagd`,
      number: null,
      stage: "aangevraagd" as const,
      scheduledDate: null,
      description: "VOORBEELD — Aangevraagd: WC loopt traag weg (nog niet ingepland).",
      createdAt: `${day(0, now)}T08:00:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-dringend`,
      number: null,
      stage: "aangevraagd" as const,
      scheduledDate: null,
      urgent: true,
      description: "VOORBEELD — Dringende aanvraag: riool verstopt, water komt omhoog.",
      createdAt: `${day(0, now)}T07:30:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-offerte`,
      number: 9001,
      stage: "offerte" as const,
      scheduledDate: null,
      description: "VOORBEELD — Offerte in opmaak: rioleringsherstel achtertuin.",
      createdAt: `${day(-3, now)}T09:00:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-gepland`,
      number: 9002,
      stage: "gepland" as const,
      scheduledDate: day(5, now),
      scheduledFrom: "08:00",
      scheduledUntil: "10:00",
      description: "VOORBEELD — Ingepland: camera-inspectie afvoerleiding keuken.",
      createdAt: `${day(-6, now)}T09:00:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-afgewerkt`,
      number: 9003,
      stage: "afgewerkt" as const,
      scheduledDate: day(-12, now),
      signedAt: `${day(-12, now)}T11:00:00Z`,
      hasPdf: true,
      description: "VOORBEELD — Afgewerkt: afvoer ontstopt met veer, werkbon afgetekend.",
      createdAt: `${day(-14, now)}T09:00:00Z`,
    },
  ];
}

type DemoInvoice = {
  id: string;
  number: string;
  kind: "factuur" | "creditnota";
  issueDate: string;
  dueDate: string;
  total: number;
  paid: number;
  state: "open" | "vervallen" | "betaald" | "creditnota";
  workOrderNumber: number | null;
};

function demoInvoiceRows(now = new Date()): DemoInvoice[] {
  return [
    { id: `${DEMO_PREFIX}inv-open`, number: "VOORBEELD-01", kind: "factuur", issueDate: day(-2, now), dueDate: day(12, now), total: 145.2, paid: 0, state: "open", workOrderNumber: null },
    { id: `${DEMO_PREFIX}inv-deels`, number: "VOORBEELD-02", kind: "factuur", issueDate: day(-5, now), dueDate: day(9, now), total: 363, paid: 150, state: "open", workOrderNumber: null },
    { id: `${DEMO_PREFIX}inv-vervallen`, number: "VOORBEELD-03", kind: "factuur", issueDate: day(-30, now), dueDate: day(-16, now), total: 186.34, paid: 0, state: "vervallen", workOrderNumber: null },
    { id: `${DEMO_PREFIX}inv-betaald`, number: "VOORBEELD-04", kind: "factuur", issueDate: day(-12, now), dueDate: day(2, now), total: 290.4, paid: 290.4, state: "betaald", workOrderNumber: 9003 },
    { id: `${DEMO_PREFIX}inv-credit`, number: "VOORBEELD-05", kind: "creditnota", issueDate: day(-10, now), dueDate: day(-10, now), total: 48.4, paid: 0, state: "creditnota", workOrderNumber: null },
  ];
}

export function demoInvoices(now = new Date()) {
  return demoInvoiceRows(now).map((i) => ({
    id: i.id,
    number: i.number,
    kind: i.kind,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    total: i.total,
    openAmount: i.kind === "creditnota" ? 0 : Math.max(0, Math.round((i.total - i.paid) * 100) / 100),
    state: i.state,
    workOrderNumber: i.workOrderNumber,
  }));
}

export async function demoDocument(
  type: "factuur" | "werkbon",
  id: string,
  customerName: string,
): Promise<{ pdf: Uint8Array; filename: string }> {
  if (type === "werkbon") {
    if (id !== `${DEMO_PREFIX}wo-afgewerkt`) throw new Error("Werkbon is nog niet beschikbaar.");
    const pdf = await createWerkbonPdf({
      number: 9003,
      customer: customerName,
      address: ADDRESS,
      siteAddress: null,
      description: "VOORBEELD — Afvoer ontstopt met veer, camera-inspectie uitgevoerd.",
      workNotes: "Dit is een voorbeeldwerkbon voor het klantportaal.",
      signedAt: `${day(-12)}T11:00:00Z`,
      signedName: customerName,
      vatNumber: null,
      signature: null,
      activity: "Ontstopping",
      seconds: 5400,
      distanceKm: 18,
      warranty: false,
      paid: null,
      materials: [{ name: "Ontstoppingsmiddel", quantity: 1, unit: "st" }],
    });
    return { pdf, filename: "Riory-Werkbon-VOORBEELD.pdf" };
  }
  const inv = demoInvoiceRows().find((i) => i.id === id);
  if (!inv) throw new Error("Document niet gevonden.");
  const net = Math.round((inv.total / 1.21) * 100) / 100;
  const pdf = await createInvoicePdf({
    number: inv.number,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    workOrderNumber: inv.workOrderNumber ?? 0,
    customer: {
      name: customerName,
      address: ADDRESS,
      siteAddress: null,
      vatNumber: null,
      email: null,
      street: "Voorbeeldstraat",
      houseNumber: "1",
      postalCode: "3700",
      city: "Tongeren",
    },
    lines: [
      { description: "VOORBEELD — Ontstopping afvoer", quantity: 1, unit: "st", unitPrice: net, amount: net },
    ],
    vatRate: 21,
    net,
    vat: Math.round((inv.total - net) * 100) / 100,
    total: inv.total,
    paidAmount: inv.paid,
    company: { name: "Riory bv", vat: "BE0840931404", iban: null, bic: null },
    terms: null,
    note: "Dit is een voorbeelddocument voor het klantportaal, geen echte factuur.",
    ...(inv.kind === "creditnota"
      ? { title: "CREDITNOTA", reference: "VOORBEELD — creditnota" }
      : inv.workOrderNumber
        ? {}
        : { title: "FACTUUR", reference: "VOORBEELD — directe factuur" }),
  });
  const label = inv.kind === "creditnota" ? "Creditnota" : "Factuur";
  return { pdf, filename: `Riory-${label}-${inv.number}.pdf` };
}
