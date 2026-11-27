/**
 * Demo content for the customer portal test account only. Nothing here is stored in the
 * database: the overview appends these items in memory and the PDFs are generated on the fly,
 * so Riory's planning, invoicing and figures never see them. Remove by emptying DEMO_EMAILS.
 */
import { createInvoicePdf } from "./invoice-pdf";
import { createWerkbonPdf } from "./werkbon-pdf";

import { PORTAL_DEMO_ONLY_EMAILS } from "./customer-portal";

export const DEMO_EMAILS = ["jasonbalongo@gmail.com", ...PORTAL_DEMO_ONLY_EMAILS];
export const DEMO_UID_PREFIX = "demo:";

/** The fictional customer behind demo-only logins (test@mail.com): no real customer record. */
export const DEMO_CUSTOMER = {
  id: "demo-customer",
  name: "Sofie Claes",
  street: "Stationsstraat",
  house_number: "24",
  postal_code: "3740",
  city: "Bilzen",
  phone: "0470 12 34 56",
  email: "test@mail.com",
  billing_email: null,
  vat_number: null,
  customer_number: "2187",
  profile_updated_at: null,
  profile_history: [],
};
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

type DemoWorkOrder = {
  id: string;
  number: number | null;
  stage: "aangevraagd" | "offerte" | "gepland" | "afgewerkt";
  scheduledDate: string | null;
  scheduledFrom: string | null;
  scheduledUntil: string | null;
  description: string;
  projectName: null;
  address: string;
  urgent: boolean;
  createdAt: string;
  signedAt: string | null;
  hasPdf: boolean;
  cancelRequested: boolean;
};

/** A realistic customer history: one open request, one planned visit and three finished jobs. */
export function demoWorkOrders(now = new Date(), address = ADDRESS): DemoWorkOrder[] {
  const base = {
    projectName: null,
    address,
    urgent: false,
    scheduledFrom: null,
    scheduledUntil: null,
    signedAt: null,
    hasPdf: false,
    cancelRequested: false,
  };
  return [
    {
      ...base,
      id: `${DEMO_PREFIX}wo-aanvraag`,
      number: null,
      stage: "aangevraagd",
      scheduledDate: null,
      description: "WC op het gelijkvloers loopt traag weg en borrelt bij het doorspoelen.",
      createdAt: `${day(-1, now)}T18:20:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-gepland`,
      number: 4231,
      stage: "gepland",
      scheduledDate: day(3, now),
      scheduledFrom: "08:00",
      scheduledUntil: "10:00",
      description: "Camera-inspectie afvoerleiding badkamer, voorafgaand aan de vervanging.",
      createdAt: `${day(-2, now)}T09:10:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-afvoer`,
      number: 4198,
      stage: "afgewerkt",
      scheduledDate: day(-6, now),
      signedAt: `${day(-6, now)}T10:40:00Z`,
      hasPdf: true,
      description: "Afvoer keuken ontstopt met veer en nagespoeld.",
      createdAt: `${day(-7, now)}T07:50:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-putje`,
      number: 4120,
      stage: "afgewerkt",
      scheduledDate: day(-40, now),
      signedAt: `${day(-40, now)}T14:15:00Z`,
      hasPdf: true,
      description: "Rioolputje achtertuin hersteld en nieuw deksel geplaatst (offerte OFF-118).",
      createdAt: `${day(-47, now)}T08:30:00Z`,
    },
    {
      ...base,
      id: `${DEMO_PREFIX}wo-wc`,
      number: 3987,
      stage: "afgewerkt",
      scheduledDate: day(-95, now),
      signedAt: `${day(-95, now)}T16:05:00Z`,
      hasPdf: true,
      description: "WC ontstopt, verstopping in de afvoer naar de septische put verwijderd.",
      createdAt: `${day(-95, now)}T11:00:00Z`,
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
  line: string;
};

function demoInvoiceRows(now = new Date()): DemoInvoice[] {
  return [
    { id: `${DEMO_PREFIX}inv-open`, number: "20260912", kind: "factuur", issueDate: day(-5, now), dueDate: day(9, now), total: 157.3, paid: 0, state: "open", workOrderNumber: 4198, line: "Ontstopping afvoer keuken" },
    { id: `${DEMO_PREFIX}inv-putje`, number: "20260871", kind: "factuur", issueDate: day(-39, now), dueDate: day(-25, now), total: 545.0, paid: 545.0, state: "betaald", workOrderNumber: 4120, line: "Herstelling rioolputje achtertuin" },
    { id: `${DEMO_PREFIX}inv-wc`, number: "20260702", kind: "factuur", issueDate: day(-94, now), dueDate: day(-80, now), total: 133.1, paid: 133.1, state: "betaald", workOrderNumber: 3987, line: "Ontstopping WC" },
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

/** Two quotes: one already approved (it became the rioolputje job), one still waiting for a decision. */
export function demoQuotes(now = new Date()) {
  const line = (index: number, description: string, quantity: number, unit: string, amount: number, optional = false) => ({
    index,
    description,
    quantity,
    unit,
    amount,
    optional,
  });
  return [
    {
      id: `${DEMO_PREFIX}q-badkamer`,
      number: "OFF-131",
      kind: "offerte",
      status: "verzonden",
      total: 1452,
      net: 1200,
      vat: 252,
      date: `${day(-2, now)}T15:00:00Z`,
      signedAt: null,
      signedName: null,
      signUrl: null,
      intro: "Vervanging van de afvoerleiding onder de badkamer.",
      lines: [
        line(0, "Uitbreken en vervangen afvoerleiding PVC Ø110 (6 m)", 6, "m", 690),
        line(1, "Aansluiten op bestaande rioolput", 1, "st", 260),
        line(2, "Werkuren loodgieter", 2.5, "u", 250),
        line(3, "Camera-inspectie na de werken (optie)", 1, "st", 145, true),
      ],
    },
    {
      id: `${DEMO_PREFIX}q-putje`,
      number: "OFF-118",
      kind: "offerte",
      status: "akkoord",
      total: 545,
      net: 450.41,
      vat: 94.59,
      date: `${day(-50, now)}T10:00:00Z`,
      signedAt: `${day(-46, now)}T19:30:00Z`,
      signedName: "Jason Balongo",
      signUrl: null,
      intro: "Herstelling rioolputje achtertuin.",
      lines: [
        line(0, "Herstellen rioolputje en vervangen deksel", 1, "st", 360.41),
        line(1, "Werkuren", 1.5, "u", 90),
      ],
    },
  ];
}

export async function demoDocument(
  type: "factuur" | "werkbon",
  id: string,
  customerName: string,
  cust: { street?: string | null; house_number?: string | null; postal_code?: string | null; city?: string | null } = {},
): Promise<{ pdf: Uint8Array; filename: string }> {
  const street = cust.street ?? "Voorbeeldstraat";
  const houseNumber = cust.street ? (cust.house_number ?? "") : "1";
  const postalCode = cust.street ? (cust.postal_code ?? "") : "3700";
  const city = cust.street ? (cust.city ?? "") : "Tongeren";
  const address = [[street, houseNumber].filter(Boolean).join(" "), [postalCode, city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (type === "werkbon") {
    const wo = demoWorkOrders().find((w) => w.id === id && w.hasPdf);
    if (!wo) throw new Error("Werkbon is nog niet beschikbaar.");
    const pdf = await createWerkbonPdf({
      number: wo.number ?? 0,
      customer: customerName,
      address,
      siteAddress: null,
      description: wo.description,
      workNotes: "Dit is een voorbeeldwerkbon voor het klantportaal.",
      signedAt: wo.signedAt,
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
    return { pdf, filename: `Riory-Werkbon-${wo.number}.pdf` };
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
      address,
      siteAddress: null,
      vatNumber: null,
      email: null,
      street,
      houseNumber,
      postalCode,
      city,
    },
    lines: [
      { description: inv.line, quantity: 1, unit: "st", unitPrice: net, amount: net },
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
