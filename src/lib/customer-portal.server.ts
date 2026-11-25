// Server-only helpers for the customer portal. Every caller has already authenticated
// (or, for the login request, only ever gets a generic answer back).
import {
  buildPortalLoginUrl,
  escapeIlike,
  normalizePortalEmail,
  nextPortalLoginLog,
  portalEmailAllowed,
  portalLoginAllowed,
  portalLoginMailText,
  sameEmail,
} from "./customer-portal";

type Db = any;

const WO_FIELDS =
  "id, number, status, email, billing_email, scheduled_date, scheduled_from, scheduled_until, description, street, house_number, postal_code, city, use_site_address, site_street, site_house_number, site_postal_code, site_city, project_name, urgent, created_at, signed_at, customer_id, not_needed";
const INVOICE_FIELDS =
  "id, number, kind, status, issue_date, due_date, total, paid_amount, paid_at, work_order_id, sent_at, customer";
const QUOTE_FIELDS =
  "id, number, kind, status, total, created_at, sent_at, signed_at, token, customer";
const SCOPE_LIMIT = 200;

function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}

function check<T>(res: { data: T | null; error: unknown }, what: string): T {
  if (res.error) {
    console.error(`portal ${what}`, res.error);
    throw new Error("Portaalgegevens konden niet geladen worden. Probeer later opnieuw.");
  }
  return (res.data ?? ([] as unknown)) as T;
}

const invoiceEmail = (row: { customer?: { email?: string | null } | null }) =>
  row.customer?.email ?? null;

/** Every customer record that belongs to this e-mail address: customer file, work orders and sent invoices. */
export async function findPortalCustomerIds(db: Db, rawEmail: string): Promise<string[]> {
  const target = normalizePortalEmail(rawEmail);
  if (!target || !portalEmailAllowed(target)) return [];
  const pattern = escapeIlike(target);
  const [c1, c2, w1, w2, inv] = await Promise.all([
    db.from("customers").select("id, email").ilike("email", pattern).limit(SCOPE_LIMIT),
    db
      .from("customers")
      .select("id, billing_email")
      .ilike("billing_email", pattern)
      .limit(SCOPE_LIMIT),
    db
      .from("work_orders")
      .select("customer_id, email")
      .ilike("email", pattern)
      .not("customer_id", "is", null)
      .limit(SCOPE_LIMIT),
    db
      .from("work_orders")
      .select("customer_id, billing_email")
      .ilike("billing_email", pattern)
      .not("customer_id", "is", null)
      .limit(SCOPE_LIMIT),
    db
      .from("invoices")
      .select("work_order_id, customer")
      .ilike("customer->>email", pattern)
      .not("work_order_id", "is", null)
      .limit(SCOPE_LIMIT),
  ]);
  // ilike is only a pre-filter: every hit is re-checked for an exact address match.
  const ids = new Set<string>();
  for (const r of check<{ id: string; email: string | null }[]>(c1, "customers"))
    if (sameEmail(r.email, target)) ids.add(r.id);
  for (const r of check<{ id: string; billing_email: string | null }[]>(c2, "customers"))
    if (sameEmail(r.billing_email, target)) ids.add(r.id);
  for (const r of check<{ customer_id: string; email: string | null }[]>(w1, "work_orders"))
    if (sameEmail(r.email, target)) ids.add(r.customer_id);
  for (const r of check<{ customer_id: string; billing_email: string | null }[]>(w2, "work_orders"))
    if (sameEmail(r.billing_email, target)) ids.add(r.customer_id);
  const invWoIds = uniq(
    check<{ work_order_id: string; customer: { email?: string | null } | null }[]>(inv, "invoices")
      .filter((r) => sameEmail(invoiceEmail(r), target))
      .map((r) => r.work_order_id),
  );
  if (invWoIds.length) {
    const res = await db
      .from("work_orders")
      .select("customer_id")
      .in("id", invWoIds)
      .not("customer_id", "is", null);
    for (const r of check<{ customer_id: string }[]>(res, "work_orders")) ids.add(r.customer_id);
  }
  return [...ids];
}

/** Everything a portal user may see: own customer records plus documents addressed to their e-mail. */
export async function loadPortalScope(db: Db, rawEmail: string, customerIds: readonly string[]) {
  const target = normalizePortalEmail(rawEmail);
  const byEmailAllowed = !!target && portalEmailAllowed(target);
  const pattern = escapeIlike(target);
  const none = Promise.resolve({ data: [], error: null });
  const [byCustomer, byEmail, byBilling] = await Promise.all([
    customerIds.length
      ? db
          .from("work_orders")
          .select(WO_FIELDS)
          .in("customer_id", customerIds)
          .order("created_at", { ascending: false })
          .limit(SCOPE_LIMIT)
      : none,
    byEmailAllowed
      ? db
          .from("work_orders")
          .select(WO_FIELDS)
          .ilike("email", pattern)
          .order("created_at", { ascending: false })
          .limit(SCOPE_LIMIT)
      : none,
    byEmailAllowed
      ? db
          .from("work_orders")
          .select(WO_FIELDS)
          .ilike("billing_email", pattern)
          .order("created_at", { ascending: false })
          .limit(SCOPE_LIMIT)
      : none,
  ]);
  const woMap = new Map<string, any>();
  for (const w of check<any[]>(byCustomer, "work_orders")) if (!w.not_needed) woMap.set(w.id, w);
  for (const w of check<any[]>(byEmail, "work_orders"))
    if (!w.not_needed && sameEmail(w.email, target)) woMap.set(w.id, w);
  for (const w of check<any[]>(byBilling, "work_orders"))
    if (!w.not_needed && sameEmail(w.billing_email, target)) woMap.set(w.id, w);
  const workOrders = [...woMap.values()]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, SCOPE_LIMIT);
  const woIds = workOrders.map((w) => w.id as string);

  const [i1, i2, i3, q1, q2, q3, q4] = await Promise.all([
    woIds.length
      ? db.from("invoices").select(INVOICE_FIELDS).in("work_order_id", woIds).limit(SCOPE_LIMIT)
      : none,
    woIds.length
      ? db
          .from("invoices")
          .select(INVOICE_FIELDS)
          .overlaps("extra_work_order_ids", woIds)
          .limit(SCOPE_LIMIT)
      : none,
    byEmailAllowed
      ? db
          .from("invoices")
          .select(INVOICE_FIELDS)
          .ilike("customer->>email", pattern)
          .limit(SCOPE_LIMIT)
      : none,
    customerIds.length
      ? db.from("quotes").select(QUOTE_FIELDS).in("customer_id", customerIds).limit(SCOPE_LIMIT)
      : none,
    woIds.length
      ? db.from("quotes").select(QUOTE_FIELDS).in("work_order_id", woIds).limit(SCOPE_LIMIT)
      : none,
    woIds.length
      ? db.from("quotes").select(QUOTE_FIELDS).in("source_work_order_id", woIds).limit(SCOPE_LIMIT)
      : none,
    byEmailAllowed
      ? db.from("quotes").select(QUOTE_FIELDS).ilike("customer->>email", pattern).limit(SCOPE_LIMIT)
      : none,
  ]);

  const invMap = new Map<string, any>();
  const addInvoice = (inv: any) => {
    const sent = !!inv.sent_at || inv.status === "verzonden" || inv.status === "betaald";
    if (sent && inv.status !== "concept" && inv.status !== "draft") invMap.set(inv.id, inv);
  };
  for (const inv of check<any[]>(i1, "invoices")) addInvoice(inv);
  for (const inv of check<any[]>(i2, "invoices")) addInvoice(inv);
  for (const inv of check<any[]>(i3, "invoices"))
    if (sameEmail(invoiceEmail(inv), target)) addInvoice(inv);
  const invoices = [...invMap.values()].sort((a, b) =>
    String(b.issue_date ?? b.sent_at ?? "").localeCompare(String(a.issue_date ?? a.sent_at ?? "")),
  );

  const qMap = new Map<string, any>();
  const addQuote = (q: any) => {
    if (q.status === "verzonden" || q.status === "akkoord") qMap.set(q.id, q);
  };
  for (const list of [q1, q2, q3]) for (const q of check<any[]>(list, "quotes")) addQuote(q);
  for (const q of check<any[]>(q4, "quotes")) if (sameEmail(invoiceEmail(q), target)) addQuote(q);
  const quotes = [...qMap.values()].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );

  return { workOrders, invoices, quotes };
}

/** Resolve the logged-in portal user: an active portal account plus every customer record of their e-mail. */
export async function resolvePortalAccess(db: Db, userId: string, claimsEmail: unknown) {
  const accounts = check<{ id: string; customer_id: string; email: string; active: boolean }[]>(
    await db
      .from("customer_portal_accounts")
      .select("id, customer_id, email, active")
      .eq("user_id", userId),
    "accounts",
  );
  const active = accounts.filter((a) => a.active);
  if (!active.length)
    throw new Error("Geen actieve toegang tot het klantenportaal voor dit account.");
  if (await isInternalUser(db, userId))
    throw new Error("Dit is een Riory-medewerkersaccount. Log in met een klantaccount.");
  const email = normalizePortalEmail(
    typeof claimsEmail === "string" && claimsEmail ? claimsEmail : active[0]!.email,
  );
  const linked = await findPortalCustomerIds(db, email);
  const customerIds = uniq([...active.map((a) => a.customer_id), ...linked]);
  await db
    .from("customer_portal_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .in(
      "id",
      active.map((a) => a.id),
    );
  return {
    email,
    customerIds,
    primaryCustomerId: active[0]!.customer_id,
    accountIds: active.map((a) => a.id),
  };
}

/** Staff accounts (admin, technician, marketing) never get passwordless portal access. */
async function isInternalUser(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) return true;
  return ((data ?? []) as { role: string }[]).some((r) => r.role !== "customer");
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}Aa1!`;
}

async function sendViaRioryMailbox(
  db: Db,
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const { getConnectionKeyForUser } = await import("./appUserConnections.server");
  const { WERKBON_MAILBOX_KEY } = await import("./werkbon-mailbox.functions");
  const { WERKBON_MAIL_SCOPES } = await import("./outlook-scopes");
  const { brandedBody } = await import("./mail-html");
  const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
  let key: string | null = null;
  for (const a of admins ?? []) {
    key = await getConnectionKeyForUser(a.user_id, WERKBON_MAILBOX_KEY);
    if (key) break;
  }
  if (!key) {
    console.error("portal login mail: mailbox not connected");
    return false;
  }
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  const res = await callAsAppUser({
    gatewayBaseUrl: "https://connector-gateway.lovable.dev",
    connectionAPIKey: key,
    connectorId: "microsoft_outlook",
    path: "/me/sendMail",
    requiredScopes: WERKBON_MAIL_SCOPES,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: brandedBody(text),
          toRecipients: [{ emailAddress: { address: to } }],
        },
      }),
    },
  });
  if (!res.ok) {
    console.error("portal login mail", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

/**
 * Send a one-time login link when the e-mail belongs to a Riory customer.
 * Always resolves without revealing whether the address is known.
 */
export async function requestPortalLoginLink(db: Db, rawEmail: string): Promise<void> {
  const email = normalizePortalEmail(rawEmail);
  if (!portalEmailAllowed(email)) return;
  const customerIds = await findPortalCustomerIds(db, email);
  if (!customerIds.length) return;

  const { data: existing } = await db
    .from("customer_portal_accounts")
    .select("id, user_id, customer_id, active, email")
    .ilike("email", escapeIlike(email))
    .limit(20);
  const known = (
    (existing ?? []) as {
      id: string;
      user_id: string | null;
      customer_id: string;
      active: boolean;
      email: string;
    }[]
  ).filter((a) => sameEmail(a.email, email));
  // An admin switched portal access off for this address: never re-enable it automatically.
  if (known.length && !known.some((a) => a.active)) return;

  let userId: string | null = known.find((a) => a.user_id)?.user_id ?? null;
  if (userId) {
    const { data: u } = await db.auth.admin.getUserById(userId);
    if (!u?.user) userId = null;
    else if (await isInternalUser(db, userId)) return;
    else if (!portalLoginAllowed(u.user.app_metadata?.portal_login_log as string[] | undefined))
      return;
  }

  let created = false;
  if (!userId) {
    const { data: c, error } = await db.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { portal_customer_id: customerIds[0] },
    });
    if (c?.user) {
      userId = c.user.id;
      created = true;
    } else if (error && !/already|exists|registered/i.test(error.message ?? "")) {
      console.error("portal login: create user", error.message);
      return;
    }
  }

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link?.user || !link.properties?.hashed_token) {
    console.error("portal login: generate link", linkErr?.message);
    return;
  }
  userId = link.user.id as string;
  if (!created && (await isInternalUser(db, userId))) return;
  if (
    !created &&
    !portalLoginAllowed(link.user.app_metadata?.portal_login_log as string[] | undefined)
  )
    return;
  if (created) {
    const { error: roleErr } = await db
      .from("user_roles")
      .insert({ user_id: userId, role: "customer" });
    if (roleErr) console.error("portal login: customer role", roleErr.message);
  }

  // One portal account per login; the other customer records are linked live via the e-mail address.
  const mine = known.find((a) => a.user_id === userId);
  if (!mine) {
    const stale = known[0];
    if (stale) {
      await db.from("customer_portal_accounts").update({ user_id: userId }).eq("id", stale.id);
    } else {
      const { error: insErr } = await db.from("customer_portal_accounts").insert({
        customer_id: customerIds[0],
        user_id: userId,
        email,
        active: true,
      });
      if (insErr) {
        console.error("portal login: account", insErr.message);
        return;
      }
    }
  }

  const sent = await sendViaRioryMailbox(
    db,
    email,
    "Riory — uw inloglink voor het klantenportaal",
    portalLoginMailText(buildPortalLoginUrl(link.properties.hashed_token)),
  );
  if (sent) {
    await db.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...(link.user.app_metadata ?? {}),
        portal_login_log: nextPortalLoginLog(
          link.user.app_metadata?.portal_login_log as string[] | undefined,
        ),
      },
    });
  }
}
