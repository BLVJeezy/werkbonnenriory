/** The customer portal lives on the official website, next to the Riory admin. */
export const PORTAL_PUBLIC_URL = "https://www.riory.be/klantportaal";
export const RIORY_WEBSITE_URL = "https://www.riory.be";

/** Origins allowed to call the portal API (riory.be and its Vercel previews). */
export function portalOriginAllowed(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return (
    origin === "https://www.riory.be" ||
    origin === "https://riory.be" ||
    /^https:\/\/riory-[a-z0-9-]+-blvjeezys-projects\.vercel\.app$/.test(origin)
  );
}

export type PortalAppointmentInput = {
  description: string;
  preferredWindow?: string | undefined;
  contactPhone?: string | undefined;
  urgent?: boolean | undefined;
};

export function buildPortalAppointmentDescription(input: PortalAppointmentInput): string {
  const parts: string[] = [input.description.trim()];
  if (input.preferredWindow?.trim()) {
    parts.push(`Voorkeur moment: ${input.preferredWindow.trim()}`);
  }
  if (input.contactPhone?.trim()) {
    parts.push(`Contacttelefoon aanvraag: ${input.contactPhone.trim()}`);
  }
  if (input.urgent) {
    parts.push("Aangeduid als dringend door klant.");
  }
  parts.push("[Aangevraagd via klantenportaal]");
  return parts.join("\n");
}
// ---------------------------------------------------------------------------
// Inloggen met het e-mailadres van bestaande facturen/werkbonnen (magic link)
// ---------------------------------------------------------------------------

export const PORTAL_LOGIN_MIN_GAP_SECONDS = 120;
export const PORTAL_LOGIN_MAX_PER_DAY = 5;

export function normalizePortalEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Escape a literal value for a PostgREST ilike filter so it only matches exactly (case-insensitive). */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function validPortalLoginToken(token: string): boolean {
  // Auth hashes are opaque: deployments can prefix/version them or use different hash lengths.
  return /^[a-zA-Z0-9_-]{32,512}$/.test(token);
}

/** One-time login link; the token lives in the hash so it never reaches server logs or referrers. */
export function buildPortalLoginUrl(tokenHash: string): string {
  if (!validPortalLoginToken(tokenHash)) throw new Error("Ongeldige inlogcode");
  return `${PORTAL_PUBLIC_URL}#login=${tokenHash}`;
}

/** Rate limit per address: at most one mail every 2 minutes and 5 per 24 hours. */
export function portalLoginAllowed(
  log: readonly string[] | null | undefined,
  now = new Date(),
): boolean {
  const times = (log ?? []).map((t) => new Date(t).getTime()).filter((t) => !Number.isNaN(t));
  const nowMs = now.getTime();
  if (times.some((t) => nowMs - t < PORTAL_LOGIN_MIN_GAP_SECONDS * 1000)) return false;
  return times.filter((t) => nowMs - t < 24 * 3600 * 1000).length < PORTAL_LOGIN_MAX_PER_DAY;
}

/** Keep only the last 24 hours of login-mail timestamps, plus the new one. */
export function nextPortalLoginLog(
  log: readonly string[] | null | undefined,
  now = new Date(),
): string[] {
  const keep = (log ?? []).filter((t) => {
    const ms = new Date(t).getTime();
    return !Number.isNaN(ms) && now.getTime() - ms < 24 * 3600 * 1000;
  });
  return [...keep, now.toISOString()].slice(-PORTAL_LOGIN_MAX_PER_DAY);
}

/** PostgREST treats `*` as a wildcard that cannot be escaped, so such addresses are refused outright. */
/**
 * Test phase: only these addresses may use the portal. Set to null to open it to every customer.
 */
export const PORTAL_TEST_ALLOWLIST: readonly string[] | null = ["jasonbalongo@gmail.com"];

export function portalEmailAllowed(email: string): boolean {
  if (email.includes("*")) return false;
  if (PORTAL_TEST_ALLOWLIST === null) return true;
  return PORTAL_TEST_ALLOWLIST.includes(email.trim().toLowerCase());
}

/** Exact, case-insensitive comparison used to double-check every ilike match server-side. */
export function sameEmail(value: string | null | undefined, normalized: string): boolean {
  return !!value && normalizePortalEmail(value) === normalized;
}

export function portalLoginMailText(link: string): string {
  return [
    "Beste klant,",
    "",
    "U vroeg een inloglink aan voor het Riory-klantenportaal. Klik op de knop hieronder om in te loggen:",
    link,
    "",
    "✓ In het portaal vindt u uw werkbonnen, facturen en offertes",
    "✓ U kunt er ook rechtstreeks een nieuwe afspraak aanvragen",
    "",
    "! Deze link werkt één keer en vervalt na 1 uur. Heeft u deze link niet aangevraagd? Dan mag u deze mail negeren.",
    "",
    "Met vriendelijke groeten,",
    "Riory",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Weergave-helpers voor het portaal
// ---------------------------------------------------------------------------

export type PortalStage = "aangevraagd" | "offerte" | "gepland" | "afgewerkt";

export function workOrderStage(wo: {
  status: string | null;
  scheduled_date: string | null;
  signed_at?: string | null;
}): PortalStage {
  if (wo.status === "afgetekend" || wo.signed_at) return "afgewerkt";
  if (wo.status === "offerte") return "offerte";
  if (wo.scheduled_date || wo.status === "toegewezen") return "gepland";
  return "aangevraagd";
}

export const PORTAL_STAGE_LABEL: Record<PortalStage, string> = {
  aangevraagd: "Aangevraagd",
  offerte: "Offerte in opmaak",
  gepland: "Ingepland",
  afgewerkt: "Afgewerkt",
};

export type PortalInvoiceState = "betaald" | "open" | "vervallen" | "creditnota";

export function invoicePortalState(
  inv: {
    kind?: string | null;
    status?: string | null;
    total: number | string | null;
    paid_amount?: number | string | null;
    paid_at?: string | null;
    due_date?: string | null;
  },
  today = new Date(),
): PortalInvoiceState {
  if (inv.kind === "creditnota") return "creditnota";
  const total = Number(inv.total ?? 0);
  const paid = Number(inv.paid_amount ?? 0);
  if (inv.status === "betaald" || inv.paid_at || (total > 0 && paid >= total - 0.005))
    return "betaald";
  if (inv.due_date) {
    const due = new Date(`${inv.due_date}T23:59:59`);
    if (!Number.isNaN(due.getTime()) && due.getTime() < today.getTime()) return "vervallen";
  }
  return "open";
}

export function invoiceOpenAmount(inv: {
  kind?: string | null;
  total: number | string | null;
  paid_amount?: number | string | null;
}): number {
  if (inv.kind === "creditnota") return 0;
  return Math.max(
    0,
    Math.round((Number(inv.total ?? 0) - Number(inv.paid_amount ?? 0)) * 100) / 100,
  );
}

type ProjectSource = {
  id: string;
  project_name?: string | null;
  use_site_address?: boolean | null;
  site_street?: string | null;
  site_house_number?: string | null;
  site_postal_code?: string | null;
  site_city?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

function joinAddress(
  street?: string | null,
  nr?: string | null,
  pc?: string | null,
  city?: string | null,
): string {
  const l1 = [street, nr]
    .filter((x) => x && x.trim())
    .join(" ")
    .trim();
  const l2 = [pc, city]
    .filter((x) => x && x.trim())
    .join(" ")
    .trim();
  return [l1, l2].filter(Boolean).join(", ");
}

export function portalWorkAddress(wo: ProjectSource): string {
  const site = joinAddress(wo.site_street, wo.site_house_number, wo.site_postal_code, wo.site_city);
  if (site && (wo.use_site_address ?? true)) return site;
  return joinAddress(wo.street, wo.house_number, wo.postal_code, wo.city) || site;
}

/** Group work orders per project (explicit project name, else work address), keeping input order. */
export function groupPortalProjects<T extends ProjectSource>(
  rows: readonly T[],
): { key: string; title: string; subtitle: string | null; items: T[] }[] {
  const groups = new Map<
    string,
    { key: string; title: string; subtitle: string | null; items: T[] }
  >();
  for (const wo of rows) {
    const name = wo.project_name?.trim();
    const address = portalWorkAddress(wo);
    const key = name ? `p:${name.toLowerCase()}` : `a:${address.toLowerCase() || "onbekend"}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        title: name || address || "Overige opdrachten",
        subtitle: name ? address || null : null,
        items: [],
      };
      groups.set(key, g);
    }
    g.items.push(wo);
  }
  return [...groups.values()];
}
