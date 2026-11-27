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
  "id, number, status, customer_name, email, billing_email, scheduled_date, scheduled_from, scheduled_until, description, street, house_number, postal_code, city, use_site_address, site_street, site_house_number, site_postal_code, site_city, project_name, urgent, created_at, signed_at, customer_id, not_needed";
const INVOICE_FIELDS =
  "id, number, kind, status, issue_date, due_date, total, paid_amount, paid_at, work_order_id, sent_at, customer";
const QUOTE_FIELDS =
  "id, number, kind, status, total, net, vat, vat_rate, intro, lines, created_at, sent_at, signed_at, signed_name, token, customer";
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
    if (q.status === "verzonden" || q.status === "akkoord" || q.status === "geweigerd") qMap.set(q.id, q);
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
  if (await staffBlocked(db, userId))
    throw new Error("Dit is een Riory-medewerkersaccount zonder portaaltoegang.");
  const email = normalizePortalEmail(
    typeof claimsEmail === "string" && claimsEmail ? claimsEmail : active[0]!.email,
  );
  if (!portalEmailAllowed(email))
    throw new Error("Het klantenportaal is nog niet open voor dit account.");
  // A staff account (admin-granted) sees a read-only preview of a linked customer, unless every
  // linked customer file is the staff member's own (same e-mail): then it is a normal customer view.
  const preview = (await isInternalUser(db, userId)) && !(await linkedToOwnFile(db, active, email));
  let customerIds: string[];
  let scopeEmail = email;
  if (preview) {
    customerIds = uniq(active.map((a) => a.customer_id));
    const { data: c } = await db
      .from("customers")
      .select("email")
      .eq("id", active[0]!.customer_id)
      .maybeSingle();
    scopeEmail = c?.email ? normalizePortalEmail(c.email) : "";
  } else {
    const linked = await findPortalCustomerIds(db, email);
    customerIds = uniq([...active.map((a) => a.customer_id), ...linked]);
  }
  await db
    .from("customer_portal_accounts")
    .update({ last_login_at: new Date().toISOString() })
    .in(
      "id",
      active.map((a) => a.id),
    );
  return {
    email,
    scopeEmail,
    preview,
    customerIds,
    primaryCustomerId: active[0]!.customer_id,
    accountIds: active.map((a) => a.id),
  };
}

async function linkedToOwnFile(
  db: Db,
  active: { customer_id: string }[],
  email: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("customers")
    .select("id, email, billing_email")
    .in("id", uniq(active.map((a) => a.customer_id)));
  if (error || !data?.length) return false;
  const rows = data as { email: string | null; billing_email: string | null }[];
  return (
    rows.length === uniq(active.map((a) => a.customer_id)).length &&
    rows.every((c) => sameEmail(c.email, email) || sameEmail(c.billing_email, email))
  );
}

const PREVIEW_READ_ONLY = "Voorbeeldweergave: wijzigingen en aanvragen zijn uitgeschakeld.";

async function isInternalUser(db: Db, userId: string): Promise<boolean> {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) return true;
  return ((data ?? []) as { role: string }[]).some((r) => r.role !== "customer");
}

/**
 * Staff accounts (admin, technician, marketing) only get portal access when an admin
 * explicitly granted it ("Toegang geven" in the customer file); never automatically.
 */
async function staffBlocked(db: Db, userId: string): Promise<boolean> {
  if (!(await isInternalUser(db, userId))) return false;
  const { data } = await db
    .from("customer_portal_accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .not("created_by", "is", null)
    .limit(1);
  return !(data ?? []).length;
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
  const linkedIds = await findPortalCustomerIds(db, email);

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
  const customerIds = uniq([
    ...known.filter((a) => a.active).map((a) => a.customer_id),
    ...linkedIds,
  ]);
  if (!customerIds.length) return;

  let userId: string | null = known.find((a) => a.user_id)?.user_id ?? null;
  if (userId) {
    const { data: u } = await db.auth.admin.getUserById(userId);
    if (!u?.user) userId = null;
    else if (await staffBlocked(db, userId)) return;
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
  if (!created && (await staffBlocked(db, userId))) return;
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

// ---------------------------------------------------------------------------
// Portal API used by www.riory.be/klantportaal
// ---------------------------------------------------------------------------

export async function buildPortalOverview(db: Db, userId: string, claimsEmail: unknown) {
  const { workOrderStage, invoicePortalState, invoiceOpenAmount, portalWorkAddress } =
    await import("./customer-portal");
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  const [{ data: customers }, scope] = await Promise.all([
    db
      .from("customers")
      .select(
        "id, name, street, house_number, postal_code, city, phone, email, billing_email, vat_number, customer_number",
      )
      .in(
        "id",
        access.customerIds.length ? access.customerIds : ["00000000-0000-0000-0000-000000000000"],
      ),
    loadPortalScope(db, access.scopeEmail, access.customerIds),
  ]);
  const ordered = [
    ...((customers ?? []) as { id: string; name: string; phone: string | null }[]),
  ].sort(
    (x, y) => Number(y.id === access.primaryCustomerId) - Number(x.id === access.primaryCustomerId),
  );
  const { data: lastChanges } = await db
    .from("customer_profile_changes")
    .select("customer_id, created_at, changes")
    .in(
      "customer_id",
      ordered.map((c: { id: string }) => c.id).concat(["00000000-0000-0000-0000-000000000000"]),
    )
    .order("created_at", { ascending: false })
    .limit(50);
  const lastChange = new Map<string, string>();
  const history = new Map<
    string,
    { created_at: string; changes: { field: string; before: string | null; after: string | null }[] }[]
  >();
  for (const r of (lastChanges ?? []) as {
    customer_id: string;
    created_at: string;
    changes: unknown;
  }[]) {
    if (!lastChange.has(r.customer_id)) lastChange.set(r.customer_id, r.created_at);
    const list = history.get(r.customer_id) ?? [];
    const changes = Array.isArray(r.changes)
      ? (r.changes as { field?: unknown; before?: unknown; after?: unknown }[])
          .filter((c) => typeof c?.field === "string")
          .map((c) => ({
            field: c.field as string,
            before: typeof c.before === "string" ? c.before : null,
            after: typeof c.after === "string" ? c.after : null,
          }))
      : [];
    if (list.length < 10 && changes.length) list.push({ created_at: r.created_at, changes });
    history.set(r.customer_id, list);
  }
  const withChange = ordered.map((c: { id: string }) => ({
    ...c,
    profile_updated_at: lastChange.get(c.id) ?? null,
    profile_history: history.get(c.id) ?? [],
  }));
  const woNumber = new Map<string, number | null>(
    scope.workOrders.map((w: any) => [w.id, w.number ?? null]),
  );
  const today = new Date();
  const { PORTAL_SERVICES } = await import("./customer-portal");
  const demo = await import("./customer-portal-demo");
  const withDemo = demo.portalDemoEnabled(access.email, access.preview);
  const overview = {
    accountEmail: access.email,
    preview: access.preview
      ? { name: (ordered[0] as { name?: string } | undefined)?.name ?? "klant" }
      : null,
    services: PORTAL_SERVICES.map((sv) => ({ key: sv.key, label: sv.label })),
    customer: withChange[0] ?? null,
    customers: withChange,
    workOrders: scope.workOrders.map((w: any) => ({
      id: w.id as string,
      number: (w.number ?? null) as number | null,
      stage: workOrderStage(w),
      scheduledDate: (w.scheduled_date ?? null) as string | null,
      scheduledFrom: w.scheduled_from ? String(w.scheduled_from).slice(0, 5) : null,
      scheduledUntil: w.scheduled_until ? String(w.scheduled_until).slice(0, 5) : null,
      description:
        String(w.description ?? "")
          .replace(/\[Aangevraagd via klantenportaal\]/g, "")
          .replace(CANCEL_MARKER_RE, "")
          .trim() || null,
      cancelRequested: CANCEL_MARKER_RE.test(String(w.description ?? "")),
      projectName: (w.project_name ?? null) as string | null,
      address: portalWorkAddress(w),
      urgent: !!w.urgent,
      createdAt: w.created_at as string,
      signedAt: (w.signed_at ?? null) as string | null,
      hasPdf: w.status === "afgetekend",
    })),
    invoices: scope.invoices.map((inv: any) => ({
      id: inv.id as string,
      number: (inv.number ?? "") as string,
      kind: (inv.kind ?? "factuur") as string,
      issueDate: (inv.issue_date ?? null) as string | null,
      dueDate: (inv.due_date ?? null) as string | null,
      total: Number(inv.total ?? 0),
      openAmount: invoiceOpenAmount(inv),
      state: invoicePortalState(inv, today),
      workOrderNumber: inv.work_order_id ? (woNumber.get(inv.work_order_id) ?? null) : null,
    })),
    quotes: scope.quotes.map((q: any) => ({
      id: q.id as string,
      number: (q.number ?? "") as string,
      kind: (q.kind ?? "offerte") as string,
      status: q.status as string,
      total: Number(q.total ?? 0),
      date: (q.sent_at ?? q.created_at) as string,
      signedAt: (q.signed_at ?? null) as string | null,
      signUrl:
        q.status === "verzonden" && q.token ? `${PORTAL_DOCUMENT_HOST}/offerte/${q.token}` : null,
      signedName: (q.signed_name ?? null) as string | null,
      intro: (q.intro ?? null) as string | null,
      net: Number(q.net ?? 0),
      vat: Number(q.vat ?? 0),
      // Keep the original line index: approving with options sends these indexes to signQuoteRecord.
      lines: (Array.isArray(q.lines) ? q.lines : [])
        .map((l: any, index: number) => ({ l, index }))
        .filter(({ l }: { l: any }) => String(l?.description ?? "").trim())
        .map(({ l, index }: { l: any; index: number }) => ({
          index,
          description: String(l.description),
          quantity: Number(l.quantity ?? 1),
          unit: String(l.unit ?? "st"),
          amount: Number(l.amount ?? 0),
          optional: !!l.optional,
        })),
    })),
  };
  if (!withDemo) return overview;
  // Test account only: in-memory examples of every work-order and invoice state, never stored.
  return {
    ...overview,
    workOrders: [
      ...demo.demoWorkOrders(today, demoAddress(overview.customer)),
      ...overview.workOrders,
    ],
    invoices: [...demo.demoInvoices(today), ...overview.invoices],
    quotes: [...demo.demoQuotes(today), ...overview.quotes],
  };
}

/** The test account's own address on its examples, so they look like its real history. */
function demoAddress(c: any): string | undefined {
  if (!c) return undefined;
  const street = [c.street, c.house_number].filter(Boolean).join(" ");
  const city = [c.postal_code, c.city].filter(Boolean).join(" ");
  return [street, city].filter(Boolean).join(", ") || undefined;
}

const PORTAL_DOCUMENT_HOST = "https://werkbonnen.riory.be";

export async function buildPortalDocument(
  db: Db,
  userId: string,
  claimsEmail: unknown,
  input: { type: "factuur" | "werkbon"; id: string },
): Promise<{ pdf: Uint8Array; filename: string }> {
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  const demo = await import("./customer-portal-demo");
  if (input.id.startsWith(demo.DEMO_PREFIX)) {
    if (!demo.portalDemoEnabled(access.email, access.preview)) throw new Error("Document niet gevonden.");
    const { data: c } = await db
      .from("customers")
      .select("name, street, house_number, postal_code, city")
      .eq("id", access.primaryCustomerId)
      .maybeSingle();
    const cust = (c ?? {}) as { name?: string; street?: string | null; house_number?: string | null; postal_code?: string | null; city?: string | null };
    return demo.demoDocument(input.type, input.id, cust.name ?? "Klant", cust);
  }
  const scope = await loadPortalScope(db, access.scopeEmail, access.customerIds);

  if (input.type === "factuur") {
    if (!scope.invoices.some((i: any) => i.id === input.id))
      throw new Error("Document niet gevonden.");
    const { data: inv, error } = await db.from("invoices").select("*").eq("id", input.id).single();
    if (error || !inv) throw new Error("Document niet gevonden.");
    const { data: snapshot } = await db
      .from("document_deliveries")
      .select("pdf_base64")
      .eq("document_id", inv.id)
      .eq("document_type", inv.kind === "creditnota" ? "creditnota" : "factuur")
      .eq("status", "accepted")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let pdf: Uint8Array;
    if (snapshot?.pdf_base64)
      pdf = Uint8Array.from(atob(snapshot.pdf_base64), (c) => c.charCodeAt(0));
    else {
      const { pdfData } = await import("./invoice-sending.server");
      const { createInvoicePdf } = await import("./invoice-pdf");
      pdf = await createInvoicePdf(await pdfData(db, inv));
    }
    const label = inv.kind === "creditnota" ? "Creditnota" : "Factuur";
    return { pdf, filename: `Riory-${label}-${inv.number ?? String(inv.id).slice(0, 8)}.pdf` };
  }

  const wo = scope.workOrders.find((w: any) => w.id === input.id);
  if (!wo || wo.status !== "afgetekend") throw new Error("Werkbon is nog niet beschikbaar.");
  const { data: full, error } = await db
    .from("work_orders")
    .select("*")
    .eq("id", input.id)
    .single();
  if (error || !full) throw new Error("Werkbon niet gevonden.");
  const [times, materials, activity] = await Promise.all([
    db.from("time_entries").select("started_at, ended_at").eq("work_order_id", full.id),
    db
      .from("materials")
      .select("name, quantity, unit")
      .eq("work_order_id", full.id)
      .order("created_at"),
    full.activity_id
      ? db.from("activities").select("name").eq("id", full.activity_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (times.error || materials.error || activity.error)
    throw new Error("Werkbon kon niet geladen worden.");
  const { werkbonMailData } = await import("./werkbon-mail");
  const { totalSeconds } = await import("./time");
  const { createWerkbonPdf } = await import("./werkbon-pdf");
  const { loadWerkbonPhotos } = await import("./werkbon-photos.server");
  // Same allowlisted content as the werkbon mail the customer already received.
  const dto = werkbonMailData(
    {
      ...full,
      distance_km: full.distance_km == null ? null : Number(full.distance_km),
      paid_amount: full.paid_amount == null ? null : Number(full.paid_amount),
    },
    (activity.data as { name?: string } | null)?.name ?? null,
    totalSeconds(times.data ?? [], Date.now()),
    ((materials.data ?? []) as { name: string; quantity: number; unit: string }[]).map((m) => ({
      name: m.name,
      quantity: Number(m.quantity),
      unit: m.unit,
    })),
  );
  const pdf = await createWerkbonPdf(dto, await loadWerkbonPhotos(db, full.id));
  return { pdf, filename: `Riory-Werkbon-${full.number ?? "nieuw"}.pdf` };
}

export type PortalAppointmentRequest = {
  description: string;
  preferredWindow?: string | undefined;
  contactPhone?: string | undefined;
  urgent?: boolean | undefined;
  worksiteDifferent?: boolean | undefined;
  worksiteStreet?: string | undefined;
  worksiteHouseNumber?: string | undefined;
  worksitePostalCode?: string | undefined;
  worksiteCity?: string | undefined;
  projectName?: string | undefined;
  customerId?: string | undefined;
  service?: string | undefined;
};

export async function createPortalAppointment(
  db: Db,
  userId: string,
  claimsEmail: unknown,
  data: PortalAppointmentRequest,
) {
  const { buildPortalAppointmentDescription } = await import("./customer-portal");
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  if (access.preview) throw new Error(PREVIEW_READ_ONLY);
  const { portalService } = await import("./customer-portal");
  const service = portalService(data.service);
  let activityId: string | null = null;
  if (service?.activity) {
    const { data: act } = await db
      .from("activities")
      .select("id")
      .eq("name", service.activity)
      .maybeSingle();
    activityId = (act?.id as string | undefined) ?? null;
  }
  const customerId =
    data.customerId && access.customerIds.includes(data.customerId)
      ? data.customerId
      : access.primaryCustomerId;
  const { data: customer, error: custErr } = await db
    .from("customers")
    .select(
      "id, name, street, house_number, postal_code, city, phone, email, billing_email, default_vat_rate, branch_id",
    )
    .eq("id", customerId)
    .single();
  if (custErr || !customer) throw new Error("Klantgegevens niet gevonden.");
  const { data: created, error: insErr } = await db
    .from("work_orders")
    .insert({
      customer_id: customer.id,
      customer_name: customer.name,
      email: customer.email ?? access.email,
      billing_email: customer.billing_email ?? customer.email ?? access.email,
      phone: data.contactPhone?.trim() || customer.phone,
      street: customer.street,
      house_number: customer.house_number,
      postal_code: customer.postal_code,
      city: customer.city,
      site_street: data.worksiteDifferent ? data.worksiteStreet || null : null,
      site_house_number: data.worksiteDifferent ? data.worksiteHouseNumber || null : null,
      site_postal_code: data.worksiteDifferent ? data.worksitePostalCode || null : null,
      site_city: data.worksiteDifferent ? data.worksiteCity || null : null,
      use_site_address: !!data.worksiteDifferent,
      project_name: data.projectName?.trim() || null,
      activity_id: activityId,
      description: buildPortalAppointmentDescription({
        description: service ? `Dienst: ${service.label}\n${data.description}` : data.description,
        preferredWindow: data.preferredWindow,
        contactPhone: data.contactPhone,
        urgent: data.urgent,
      }),
      status: "nieuw",
      scheduled_date: null,
      urgent: !!data.urgent,
      vat_rate: customer.default_vat_rate ?? 21,
      branch_id: customer.branch_id,
      received_at: new Date().toISOString(),
    })
    .select("id, created_at")
    .single();
  if (insErr || !created)
    throw new Error("Afspraakaanvraag kon niet worden opgeslagen. Probeer opnieuw.");
  return { id: created.id as string, createdAt: created.created_at as string };
}

/** Admin: give portal access to an address that is not on the customer's records (no mail is sent). */
export async function grantPortalAccess(
  db: Db,
  customerId: string,
  rawEmail: string,
  adminId: string,
) {
  const email = normalizePortalEmail(rawEmail);
  if (!portalEmailAllowed(email))
    throw new Error(
      "Het klantenportaal is in testfase: enkel de testaccounts kunnen voorlopig toegang krijgen.",
    );
  const { data: existing } = await db
    .from("customer_portal_accounts")
    .select("id, user_id, customer_id, active, email")
    .ilike("email", escapeIlike(email))
    .limit(20);
  const rows = (
    (existing ?? []) as {
      id: string;
      user_id: string | null;
      customer_id: string;
      active: boolean;
      email: string;
    }[]
  ).filter((r) => sameEmail(r.email, email));
  const same = rows.find((r) => r.customer_id === customerId);
  if (same) {
    await db
      .from("customer_portal_accounts")
      .update({ active: true, revoked_at: null, created_by: adminId })
      .eq("id", same.id);
    return { email };
  }
  const linkedRow = rows.find((r) => r.user_id && r.active);
  if (linkedRow) {
    // Already a login for this address: record the admin's explicit grant on it.
    await db
      .from("customer_portal_accounts")
      .update({ created_by: adminId })
      .eq("id", linkedRow.id);
  }
  if (rows.some((r) => r.user_id)) {
    throw new Error(
      "Dit e-mailadres heeft al portaaltoegang via een andere klantfiche. Zet hetzelfde e-mailadres op deze klantfiche, dan wordt ze automatisch gekoppeld.",
    );
  }
  let userId: string | null = null;
  const { data: c, error } = await db.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { portal_customer_id: customerId },
  });
  if (c?.user) {
    userId = c.user.id;
    await db.from("user_roles").insert({ user_id: userId, role: "customer" });
  } else if (error && /already|exists|registered/i.test(error.message ?? "")) {
    const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
    userId = (link?.user?.id as string | undefined) ?? null;
  }
  if (!userId) throw new Error("Portaaltoegang aanmaken mislukt.");
  const { error: insErr } = await db
    .from("customer_portal_accounts")
    .insert({ customer_id: customerId, user_id: userId, email, active: true, created_by: adminId });
  if (insErr) throw new Error("Portaaltoegang aanmaken mislukt.");
  return { email };
}

/**
 * Google sign-in for the portal: the customer signed in with Google on werkbonnen.riory.be/klantportaal-google;
 * if that Google address belongs to a customer, return a one-time portal login URL for www.riory.be.
 * A brand-new Google account that is not a customer is removed again, so Google sign-in never creates stray logins.
 */
export async function portalLoginUrlForGoogleUser(
  db: Db,
  userId: string,
  rawEmail: unknown,
): Promise<string | null> {
  const email = typeof rawEmail === "string" ? normalizePortalEmail(rawEmail) : "";
  const { data: u } = await db.auth.admin.getUserById(userId);
  const user = u?.user;
  if (!user || !email || normalizePortalEmail(user.email ?? "") !== email) return null;
  if (!portalEmailAllowed(email)) {
    const fresh = Date.now() - new Date(user.created_at).getTime() < 15 * 60 * 1000;
    const { data: r } = await db.from("user_roles").select("role").eq("user_id", userId);
    const { data: a } = await db
      .from("customer_portal_accounts")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (fresh && !(r ?? []).length && !(a ?? []).length) await db.auth.admin.deleteUser(userId);
    return null;
  }

  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const { data: accRows } = await db
    .from("customer_portal_accounts")
    .select("id, customer_id, active, email, user_id")
    .ilike("email", escapeIlike(email))
    .limit(20);
  const accounts = (
    (accRows ?? []) as {
      id: string;
      customer_id: string;
      active: boolean;
      email: string;
      user_id: string | null;
    }[]
  ).filter((a) => sameEmail(a.email, email));
  const linked = await findPortalCustomerIds(db, email);
  const customerIds = uniq([
    ...accounts.filter((a) => a.active).map((a) => a.customer_id),
    ...linked,
  ]);

  const fresh = Date.now() - new Date(user.created_at).getTime() < 15 * 60 * 1000;
  if ((accounts.length && !accounts.some((a) => a.active)) || !customerIds.length) {
    if (fresh && roles.length === 0 && accounts.length === 0)
      await db.auth.admin.deleteUser(userId);
    return null;
  }
  if (roles.some((r) => r !== "customer") && (await staffBlocked(db, userId))) return null;
  if (roles.length === 0) await db.from("user_roles").insert({ user_id: userId, role: "customer" });
  if (!accounts.some((a) => a.user_id === userId)) {
    const stale = accounts[0];
    if (stale)
      await db.from("customer_portal_accounts").update({ user_id: userId }).eq("id", stale.id);
    else {
      const { error } = await db
        .from("customer_portal_accounts")
        .insert({ customer_id: customerIds[0], user_id: userId, email, active: true });
      if (error) return null;
    }
  }
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) return null;
  return buildPortalLoginUrl(link.properties.hashed_token);
}

// ---------------------------------------------------------------------------
// Portal tokens: the portal on riory.be never holds a Supabase session
// ---------------------------------------------------------------------------

function authEnv() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Portaal is niet correct geconfigureerd.");
  return { url, key };
}

/**
 * Trade the one-time login link (magic link hash) for a portal-only token.
 * The Supabase session that verification creates is revoked immediately.
 */
export async function exchangePortalLoginToken(db: Db, tokenHash: string) {
  const { validPortalLoginToken } = await import("./customer-portal");
  const { signPortalToken } = await import("./portal-token");
  if (!validPortalLoginToken(tokenHash)) return null;
  const { url, key } = authEnv();
  let session: { access_token?: string; user?: { id?: string; email?: string } } | null = null;
  for (const type of ["magiclink", "email"]) {
    const res = await fetch(`${url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ type, token_hash: tokenHash }),
    });
    if (res.ok) {
      session = await res.json();
      break;
    }
  }
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (session?.access_token) {
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => undefined);
  }
  if (!userId || !email) return null;
  await resolvePortalAccess(db, userId, email); // throws when this login has no portal access
  return signPortalToken({ uid: userId, email }, key);
}

/** Verify a portal token from the Authorization header. */
export async function verifyPortalRequestToken(token: string) {
  const { verifyPortalToken } = await import("./portal-token");
  return verifyPortalToken(token, authEnv().key);
}

export type PortalProfileInput = {
  customerId: string;
  name: string;
  phone?: string | undefined;
  street?: string | undefined;
  house_number?: string | undefined;
  postal_code?: string | undefined;
  city?: string | undefined;
  billing_email?: string | undefined;
};

const RIORY_INBOX = "info@riory.be";

/** The customer updates their own contact details; Riory gets a mail with what changed. */
export async function updatePortalProfile(
  db: Db,
  userId: string,
  claimsEmail: unknown,
  input: PortalProfileInput,
) {
  const { portalProfileChanges } = await import("./customer-portal");
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  if (access.preview) throw new Error(PREVIEW_READ_ONLY);
  if (!access.customerIds.includes(input.customerId))
    throw new Error("Klantgegevens niet gevonden.");
  const fields = [
    "name",
    "phone",
    "street",
    "house_number",
    "postal_code",
    "city",
    "billing_email",
  ] as const;
  const { data: before, error } = await db
    .from("customers")
    .select(fields.join(", "))
    .eq("id", input.customerId)
    .single();
  if (error || !before) throw new Error("Klantgegevens niet gevonden.");
  const next: Record<string, string | null> = {};
  for (const f of fields) {
    if (f in input) next[f] = (input[f] ?? "").trim() || null;
  }
  if (!next["name"]) throw new Error("Vul uw naam in.");
  const changes = portalProfileChanges(before as Record<string, string | null>, next);
  if (!changes.length) return { changed: 0 };
  const prev = before as Record<string, string | null>;
  const structured = fields
    .filter((f) => f in next && (prev[f] ?? "").trim() !== (next[f] ?? "").trim())
    .map((f) => ({ field: f, before: prev[f] ?? null, after: next[f] ?? null }));
  // Keep the old data first: without a stored history entry nothing is overwritten.
  const { data: logRow, error: logErr } = await db
    .from("customer_profile_changes")
    .insert({
      customer_id: input.customerId,
      user_id: userId,
      changed_by_email: access.email,
      source: "klantenportaal",
      changes: structured,
    })
    .select("id")
    .single();
  if (logErr || !logRow) {
    console.error("portal profile history", logErr?.message);
    throw new Error("Opslaan mislukt. Probeer opnieuw.");
  }
  const { error: upErr } = await db.from("customers").update(next).eq("id", input.customerId);
  if (upErr) {
    await db.from("customer_profile_changes").delete().eq("id", (logRow as { id: string }).id);
    if ((upErr as { code?: string }).code === "23505") {
      throw new Error(
        "Deze naam en dit adres staan al op een andere klantfiche. Mail info@riory.be, dan passen wij het aan.",
      );
    }
    throw new Error("Opslaan mislukt. Probeer opnieuw.");
  }
  await sendViaRioryMailbox(
    db,
    RIORY_INBOX,
    `Klantenportaal — gegevens gewijzigd door ${next["name"]}`,
    [
      `De klant (${access.email}) paste zelf zijn gegevens aan in het klantenportaal:`,
      "",
      ...changes.map((c) => `• ${c}`),
      "",
      "Controleer of dit klopt met eventuele lopende werkbonnen en facturen.",
    ].join("\n"),
  ).catch(() => false);
  return { changed: changes.length };
}

/** Older invoices (from before the work-order system) live in Simpla: the customer asks Riory to send them. */
export async function requestPortalInvoiceCopy(
  db: Db,
  userId: string,
  claimsEmail: unknown,
  message: string,
) {
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  if (access.preview) throw new Error(PREVIEW_READ_ONLY);
  const { data: c } = await db
    .from("customers")
    .select("name, customer_number")
    .eq("id", access.primaryCustomerId)
    .maybeSingle();
  const sent = await sendViaRioryMailbox(
    db,
    RIORY_INBOX,
    `Klantenportaal — factuur opgevraagd door ${c?.name ?? access.email}`,
    [
      `${c?.name ?? "Een klant"}${c?.customer_number ? ` (klantnr. ${c.customer_number})` : ""} vraagt via het klantenportaal een oudere factuur op.`,
      "",
      `Bericht: ${message.trim()}`,
      "",
      `Stuur de factuur naar: ${access.email}`,
    ].join("\n"),
  );
  if (!sent) throw new Error("Uw aanvraag kon niet verstuurd worden. Mail naar info@riory.be.");
  return { ok: true };
}

/**
 * "Probleem met het klantenportaal" reports go to the portal builder: set the PORTAL_SUPPORT_EMAIL
 * secret. Without it they land in Riory's own inbox so no report is lost.
 */
function portalSupportEmail(): string {
  const v = (process.env["PORTAL_SUPPORT_EMAIL"] ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : RIORY_INBOX;
}

export async function reportPortalProblem(
  db: Db,
  userId: string,
  claimsEmail: unknown,
  input: { topics: string[]; message: string; page?: string | undefined; userAgent?: string | undefined },
) {
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  // At most 5 reports per account per 24 hours, so the form cannot be used to flood the mailbox.
  const { data: u } = await db.auth.admin.getUserById(userId);
  const now = Date.now();
  const log = ((u?.user?.app_metadata?.portal_problem_log as string[] | undefined) ?? []).filter(
    (t) => now - Date.parse(t) < 24 * 3600 * 1000,
  );
  if (log.length >= 5) throw new Error("U stuurde vandaag al meerdere meldingen. Mail naar info@riory.be.");
  const { data: c } = await db
    .from("customers")
    .select("name, customer_number")
    .eq("id", access.primaryCustomerId)
    .maybeSingle();
  const sent = await sendViaRioryMailbox(
    db,
    portalSupportEmail(),
    `Klantenportaal — probleem gemeld door ${c?.name ?? access.email}`,
    [
      `${c?.name ?? "Een klant"}${c?.customer_number ? ` (klantnr. ${c.customer_number})` : ""} meldt een probleem met het klantenportaal.`,
      "",
      `Soort probleem: ${input.topics.length ? input.topics.join(", ") : "niet aangeduid"}`,
      `Uitleg: ${input.message.trim() || "(geen uitleg)"}`,
      "",
      `Login: ${access.email}${access.preview ? " (voorbeeldweergave)" : ""}`,
      `Pagina: ${input.page ?? "onbekend"}`,
      `Toestel: ${input.userAgent ?? "onbekend"}`,
      `Tijdstip: ${new Date(now).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" })}`,
    ].join("\n"),
  );
  if (!sent) throw new Error("Uw melding kon niet verstuurd worden. Mail naar info@riory.be.");
  await db.auth.admin.updateUserById(userId, {
    app_metadata: { ...(u?.user?.app_metadata ?? {}), portal_problem_log: [...log, new Date(now).toISOString()] },
  });
  return { ok: true };
}

// ---------------------------------------------------------------- quote decisions & cancellations

/** Customers cancel online up to this many hours before the appointment; later they have to call. */
export const PORTAL_CANCEL_HOURS = 24;
const CANCEL_MARKER = "[Annulering aangevraagd via klantenportaal";
const CANCEL_MARKER_RE = /\n?\[Annulering aangevraagd via klantenportaal[^\]]*\]/g;

/** Brussels wall-clock date + time → UTC milliseconds. */
export function brusselsToUtc(date: string, time: string | null): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = (time ?? "08:00").split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asBrussels = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return guess - (asBrussels - guess);
}

export async function decidePortalQuote(
  db: Db,
  userId: string,
  claimsEmail: unknown,
  input: {
    quoteId: string;
    decision: "akkoord" | "geweigerd";
    name?: string | undefined;
    signature?: string | undefined;
    options?: number[] | undefined;
    reason?: string | undefined;
  },
) {
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  if (access.preview) throw new Error(PREVIEW_READ_ONLY);
  const scope = await loadPortalScope(db, access.scopeEmail, access.customerIds);
  const q = scope.quotes.find((x: { id: string }) => x.id === input.quoteId) as
    | { id: string; number: string; status: string; total: number; customer: { name?: string } | null }
    | undefined;
  if (!q) throw new Error("Offerte niet gevonden.");
  if (q.status !== "verzonden") throw new Error("Over deze offerte werd al beslist.");
  const who = q.customer?.name ?? access.email;
  if (input.decision === "akkoord") {
    if (!input.signature?.startsWith("data:image/png") || input.signature.length > 400_000)
      throw new Error("Zet uw handtekening.");
    if (!input.name?.trim()) throw new Error("Vul uw naam in.");
    const { signQuoteRecord } = await import("./quote-sign.server");
    await signQuoteRecord(db, { column: "id", value: q.id }, {
      signature: input.signature,
      name: input.name.trim(),
      options: (input.options ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n < 500),
    });
    await sendViaRioryMailbox(
      db,
      RIORY_INBOX,
      `Klantenportaal — offerte ${q.number} goedgekeurd`,
      `${who} keurde offerte ${q.number} goed via het klantenportaal (ondertekend door ${input.name.trim()}).`,
    );
    return { ok: true };
  }
  const { data: updated, error } = await db
    .from("quotes")
    .update({ status: "geweigerd" })
    .eq("id", q.id)
    .eq("status", "verzonden")
    .select("id");
  if (error) throw new Error("Opslaan mislukt. Probeer opnieuw.");
  if (!updated?.length) throw new Error("Over deze offerte werd al beslist.");
  await sendViaRioryMailbox(
    db,
    RIORY_INBOX,
    `Klantenportaal — offerte ${q.number} geweigerd`,
    [
      `${who} weigerde offerte ${q.number} via het klantenportaal.`,
      `Reden: ${input.reason?.trim() || "(geen reden opgegeven)"}`,
    ].join("\n"),
  );
  return { ok: true };
}

export async function cancelPortalAppointment(
  db: Db,
  userId: string,
  claimsEmail: unknown,
  input: { workOrderId: string; reason?: string | undefined },
) {
  const access = await resolvePortalAccess(db, userId, claimsEmail);
  if (access.preview) throw new Error(PREVIEW_READ_ONLY);
  const scope = await loadPortalScope(db, access.scopeEmail, access.customerIds);
  const { workOrderStage, portalWorkAddress } = await import("./customer-portal");
  const w = scope.workOrders.find((x: { id: string }) => x.id === input.workOrderId) as any;
  if (!w) throw new Error("Afspraak niet gevonden.");
  if (workOrderStage(w) !== "gepland" || !w.scheduled_date)
    throw new Error("Alleen een ingeplande afspraak kan geannuleerd worden.");
  if (String(w.description ?? "").includes(CANCEL_MARKER)) return { ok: true };
  const start = brusselsToUtc(w.scheduled_date, w.scheduled_from ? String(w.scheduled_from).slice(0, 5) : null);
  if (start - Date.now() < PORTAL_CANCEL_HOURS * 3600 * 1000)
    throw new Error(`Annuleren kan online tot ${PORTAL_CANCEL_HOURS} uur vooraf. Bel ons op +32 472 50 28 14.`);
  const stamp = new Date().toLocaleString("nl-BE", { timeZone: "Europe/Brussels" });
  const reason = input.reason?.trim();
  // A visible note on the work order, so planning and crew see it; Riory removes it from the planning.
  const { error } = await db
    .from("work_orders")
    .update({
      description: `${String(w.description ?? "").trim()}\n${CANCEL_MARKER} op ${stamp}${reason ? ` — ${reason.replace(/[\[\]]/g, "")}` : ""}]`,
    })
    .eq("id", w.id);
  if (error) throw new Error("Annuleren mislukt. Bel ons op +32 472 50 28 14.");
  const sent = await sendViaRioryMailbox(
    db,
    RIORY_INBOX,
    `Klantenportaal — afspraak geannuleerd${w.number ? ` (werkbon #${w.number})` : ""}`,
    [
      `${w.customer_name ?? access.email} annuleert de afspraak van ${w.scheduled_date}${w.scheduled_from ? ` om ${String(w.scheduled_from).slice(0, 5)}` : ""}${w.number ? ` (werkbon #${w.number})` : ""}.`,
      `Adres: ${portalWorkAddress(w) ?? "-"}`,
      `Reden: ${reason || "(geen reden opgegeven)"}`,
      "",
      "Haal de afspraak uit de planning en verwittig de ploeg.",
    ].join("\n"),
  );
  if (!sent) console.error("portal cancel mail failed", w.id);
  return { ok: true };
}
