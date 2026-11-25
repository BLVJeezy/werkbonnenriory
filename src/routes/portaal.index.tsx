import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  Download,
  FileSignature,
  FileText,
  FolderOpen,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  MapPin,
  Receipt,
  Star,
} from "lucide-react";
import logo from "@/assets/riory-mail-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RIORY_WEBSITE_URL,
  PORTAL_STAGE_LABEL,
  groupPortalProjects,
  type PortalStage,
  type PortalInvoiceState,
} from "@/lib/customer-portal";
import {
  downloadPortalDocument,
  getPortalOverview,
  submitPortalAppointmentRequest,
} from "@/lib/customer-portal.functions";
import { werkbonNr } from "@/lib/werkbon-number";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portaal/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Klantenportaal — Riory" },
      {
        name: "description",
        content: "Uw werkbonnen, facturen en offertes bij Riory op één plek.",
      },
      { property: "og:title", content: "Klantenportaal — Riory" },
      {
        property: "og:description",
        content: "Uw werkbonnen, facturen en offertes bij Riory op één plek.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalHomePage,
});

type Overview = Awaited<ReturnType<typeof getPortalOverview>>;
type WorkOrder = Overview["workOrders"][number];
type Invoice = Overview["invoices"][number];
type Tab = "overzicht" | "projecten" | "facturen" | "offertes" | "afspraak";

const REVIEW_URL =
  "https://search.google.com/local/writereview?placeid=ChIJcykqZXYpckQR_ScOKGU8I64";

const euro = (n: number) =>
  new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n);

function formatDate(
  d: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  if (!d) return "—";
  const parsed = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString("nl-BE", opts);
}

const STAGE_STYLE: Record<PortalStage, string> = {
  aangevraagd: "bg-slate-100 text-slate-700",
  offerte: "bg-violet-50 text-violet-700",
  gepland: "bg-sky-50 text-sky-700",
  afgewerkt: "bg-emerald-50 text-emerald-700",
};

const INVOICE_STYLE: Record<PortalInvoiceState, { label: string; cls: string }> = {
  betaald: { label: "Betaald", cls: "bg-emerald-50 text-emerald-700" },
  open: { label: "Open", cls: "bg-amber-50 text-amber-700" },
  vervallen: { label: "Vervallen", cls: "bg-red-50 text-red-700" },
  creditnota: { label: "Creditnota", cls: "bg-slate-100 text-slate-700" },
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-black/5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
      <Icon className="size-6 text-muted-foreground/60" />
      {text}
    </div>
  );
}

function PortalHomePage() {
  const navigate = useNavigate();
  const loadOverview = useServerFn(getPortalOverview);
  const submitRequest = useServerFn(submitPortalAppointmentRequest);
  const download = useServerFn(downloadPortalDocument);

  const [tab, setTab] = useState<Tab>("overzicht");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  // Appointment request form state
  const [description, setDescription] = useState("");
  const [preferredWindow, setPreferredWindow] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [projectName, setProjectName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [worksiteDifferent, setWorksiteDifferent] = useState(false);
  const [worksiteStreet, setWorksiteStreet] = useState("");
  const [worksiteHouseNumber, setWorksiteHouseNumber] = useState("");
  const [worksitePostalCode, setWorksitePostalCode] = useState("");
  const [worksiteCity, setWorksiteCity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.assign(`/portaal/inloggen?next=${next}`);
        return;
      }
      const res = await loadOverview();
      setData(res);
      if (res.customer?.phone && !contactPhone) setContactPhone(res.customer.phone);
      if (res.customer && !customerId) setCustomerId(res.customer.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portaalgegevens konden niet worden geladen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("actie") ?? params.get("tab");
    if (t === "afspraak" || t === "facturen" || t === "projecten" || t === "offertes") setTab(t);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/portaal/inloggen" });
  }

  async function handleDownload(type: "factuur" | "werkbon", id: string) {
    setDownloading(id);
    try {
      const response = (await download({ data: { type, id } })) as unknown as Response;
      if (!response.ok) throw new Error("Document kon niet geladen worden.");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `Riory-${type}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Downloaden mislukt.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleSubmitAppointment(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submitRequest({
        data: {
          description,
          preferredWindow: preferredWindow || undefined,
          contactPhone: contactPhone || undefined,
          projectName: projectName || undefined,
          customerId: customerId || undefined,
          urgent,
          worksiteDifferent,
          worksiteStreet: worksiteDifferent ? worksiteStreet : undefined,
          worksiteHouseNumber: worksiteDifferent ? worksiteHouseNumber : undefined,
          worksitePostalCode: worksiteDifferent ? worksitePostalCode : undefined,
          worksiteCity: worksiteDifferent ? worksiteCity : undefined,
        },
      });
      toast.success("Uw aanvraag is ontvangen. Riory plant deze zo snel mogelijk in.");
      setDescription("");
      setPreferredWindow("");
      setProjectName("");
      setUrgent(false);
      setWorksiteDifferent(false);
      setWorksiteStreet("");
      setWorksiteHouseNumber("");
      setWorksitePostalCode("");
      setWorksiteCity("");
      setTab("projecten");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanvraag verzenden mislukt.");
    } finally {
      setSubmitting(false);
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const running = data.workOrders.filter((w) => w.stage !== "afgewerkt");
    const openInvoices = data.invoices.filter((i) => i.state === "open" || i.state === "vervallen");
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const next = [...data.workOrders]
      .filter((w) => w.stage === "gepland" && w.scheduledDate && w.scheduledDate >= today)
      .sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""))[0];
    return {
      running: running.length,
      openAmount: openInvoices.reduce((s, i) => s + i.openAmount, 0),
      openCount: openInvoices.length,
      toSign: data.quotes.filter((q) => q.signUrl).length,
      next,
      lastDone: data.workOrders.find((w) => w.stage === "afgewerkt"),
    };
  }, [data]);

  const projects = useMemo(
    () =>
      groupPortalProjects(
        (data?.workOrders ?? []).map((w) => ({
          ...w,
          project_name: w.projectName,
          street: w.address,
        })),
      ),
    [data],
  );

  const displayName = (data?.customer?.name ?? "").trim();
  const tabs: { key: Tab; label: string; icon: typeof FileText; count?: number | undefined }[] = [
    { key: "overzicht", label: "Overzicht", icon: LayoutGrid },
    { key: "projecten", label: "Werkbonnen", icon: FolderOpen, count: data?.workOrders.length },
    { key: "facturen", label: "Facturen", icon: Receipt, count: data?.invoices.length },
    { key: "offertes", label: "Offertes", icon: FileSignature, count: data?.quotes.length },
    { key: "afspraak", label: "Afspraak aanvragen", icon: CalendarPlus },
  ];

  function WorkOrderRow({ w }: { w: WorkOrder }) {
    return (
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Werkbon {werkbonNr(w.number)}</span>
            <Pill className={STAGE_STYLE[w.stage]}>{PORTAL_STAGE_LABEL[w.stage]}</Pill>
            {w.urgent && w.stage !== "afgewerkt" && (
              <Pill className="bg-red-50 text-red-700">Dringend</Pill>
            )}
          </div>
          {w.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{w.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {w.stage === "afgewerkt"
              ? `Afgewerkt op ${formatDate(w.signedAt ?? w.scheduledDate)}`
              : w.scheduledDate
                ? `Gepland op ${formatDate(w.scheduledDate, { weekday: "long", day: "numeric", month: "long" })}${w.scheduledFrom ? ` · ${w.scheduledFrom}${w.scheduledUntil ? `–${w.scheduledUntil}` : ""}` : ""}`
                : `Aangevraagd op ${formatDate(w.createdAt)}`}
          </p>
        </div>
        {w.hasPdf && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={downloading === w.id}
            onClick={() => handleDownload("werkbon", w.id)}
          >
            {downloading === w.id ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Werkbon (PDF)
          </Button>
        )}
      </div>
    );
  }

  function InvoiceRow({ i }: { i: Invoice }) {
    const st = INVOICE_STYLE[i.state];
    return (
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {i.kind === "creditnota" ? "Creditnota" : "Factuur"} {i.number}
            </span>
            <Pill className={st.cls}>{st.label}</Pill>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDate(i.issueDate)}
            {i.state !== "betaald" && i.state !== "creditnota" && i.dueDate
              ? ` · vervalt ${formatDate(i.dueDate)}`
              : ""}
            {i.workOrderNumber ? ` · werkbon #${i.workOrderNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div className="text-right">
            <p className="font-semibold tabular-nums">{euro(i.total)}</p>
            {(i.state === "open" || i.state === "vervallen") && i.openAmount !== i.total && (
              <p className="text-xs text-muted-foreground tabular-nums">
                nog {euro(i.openAmount)} open
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={downloading === i.id}
            onClick={() => handleDownload("factuur", i.id)}
          >
            {downloading === i.id ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            PDF
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f6f5f2] text-foreground">
      <div className="h-1.5 w-full bg-primary" />
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <a href={RIORY_WEBSITE_URL} className="flex items-center gap-3">
            <img src={logo.url} alt="Riory" className="h-8 w-auto" />
            <span className="hidden border-l pl-3 text-sm font-medium text-muted-foreground sm:inline">
              Klantenportaal
            </span>
          </a>
          <div className="flex items-center gap-3">
            {data && (
              <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground md:inline">
                {data.accountEmail}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Uitloggen</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin text-primary" /> Uw gegevens worden
            geladen…
          </div>
        ) : error ? (
          <Card className="space-y-3 p-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Opnieuw inloggen
            </Button>
          </Card>
        ) : data && stats ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {displayName ? `Welkom, ${displayName}` : "Welkom"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.customers.length > 1
                    ? `${data.customers.length} adressen gekoppeld aan ${data.accountEmail}`
                    : "Al uw werkbonnen, facturen en offertes bij Riory op één plek."}
                </p>
              </div>
              <Button className="h-10 font-semibold" onClick={() => setTab("afspraak")}>
                <CalendarPlus className="size-4" /> Nieuwe afspraak
              </Button>
            </div>

            <nav aria-label="Klantenportaal" className="-mx-4 overflow-x-auto px-4">
              <div className="inline-flex min-w-full gap-1 rounded-xl border border-black/5 bg-white p-1 sm:min-w-0">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    aria-current={tab === t.key ? "page" : undefined}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                      tab === t.key
                        ? "bg-[#1e2e34] text-white"
                        : "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground",
                    )}
                  >
                    <t.icon className="size-4" />
                    {t.label}
                    {t.count ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-xs",
                          tab === t.key ? "bg-white/15" : "bg-black/5",
                        )}
                      >
                        {t.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </nav>

            {tab === "overzicht" && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <Card className="p-3.5 sm:p-5">
                    <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">
                      Lopende opdrachten
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums sm:mt-2 sm:text-3xl">
                      {stats.running}
                    </p>
                  </Card>
                  <Card className="p-3.5 sm:p-5">
                    <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">
                      Openstaand
                    </p>
                    <p
                      className={cn(
                        "mt-1.5 text-lg font-bold tabular-nums sm:mt-2 sm:text-3xl",
                        stats.openAmount > 0 && "text-amber-700",
                      )}
                    >
                      {euro(stats.openAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats.openCount === 1 ? "1 factuur" : `${stats.openCount} facturen`}
                    </p>
                  </Card>
                  <Card className="p-3.5 sm:p-5">
                    <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs">
                      Offertes te tekenen
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums sm:mt-2 sm:text-3xl">
                      {stats.toSign}
                    </p>
                  </Card>
                </div>

                {stats.next && (
                  <Card className="flex items-start gap-4 border-sky-100 bg-sky-50/60 p-5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
                      <CalendarClock className="size-5 text-sky-700" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-sky-900">Volgende afspraak</p>
                      <p className="text-lg font-semibold">
                        {formatDate(stats.next.scheduledDate, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                        {stats.next.scheduledFrom
                          ? ` · ${stats.next.scheduledFrom}${stats.next.scheduledUntil ? `–${stats.next.scheduledUntil}` : ""}`
                          : ""}
                      </p>
                      {stats.next.address && (
                        <p className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="size-3.5" />
                          {stats.next.address}
                        </p>
                      )}
                    </div>
                  </Card>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <div className="flex items-center justify-between border-b px-5 py-4">
                      <h2 className="font-semibold">Recente werkbonnen</h2>
                      <button
                        className="inline-flex items-center gap-1 text-sm text-primary"
                        onClick={() => setTab("projecten")}
                      >
                        Alles <ArrowRight className="size-3.5" />
                      </button>
                    </div>
                    {data.workOrders.length ? (
                      <div className="divide-y">
                        {data.workOrders.slice(0, 4).map((w) => (
                          <WorkOrderRow key={w.id} w={w} />
                        ))}
                      </div>
                    ) : (
                      <Empty icon={FolderOpen} text="Nog geen werkbonnen." />
                    )}
                  </Card>
                  <Card>
                    <div className="flex items-center justify-between border-b px-5 py-4">
                      <h2 className="font-semibold">Recente facturen</h2>
                      <button
                        className="inline-flex items-center gap-1 text-sm text-primary"
                        onClick={() => setTab("facturen")}
                      >
                        Alles <ArrowRight className="size-3.5" />
                      </button>
                    </div>
                    {data.invoices.length ? (
                      <div className="divide-y">
                        {data.invoices.slice(0, 4).map((i) => (
                          <InvoiceRow key={i.id} i={i} />
                        ))}
                      </div>
                    ) : (
                      <Empty icon={Receipt} text="Nog geen facturen." />
                    )}
                  </Card>
                </div>

                {stats.lastDone && (
                  <Card className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <Star className="size-5 text-primary" />
                      <p className="text-sm">
                        <span className="font-semibold">Tevreden over onze service?</span> Een
                        Google-review helpt ons enorm.
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer">
                        Review schrijven
                      </a>
                    </Button>
                  </Card>
                )}
              </div>
            )}

            {tab === "projecten" && (
              <div className="space-y-4">
                {projects.length ? (
                  projects.map((p) => (
                    <Card key={p.key}>
                      <div className="flex items-center gap-3 border-b px-5 py-4">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                          <MapPin className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate font-semibold">{p.title}</h2>
                          <p className="text-xs text-muted-foreground">
                            {p.subtitle ? `${p.subtitle} · ` : ""}
                            {p.items.length === 1 ? "1 werkbon" : `${p.items.length} werkbonnen`}
                          </p>
                        </div>
                      </div>
                      <div className="divide-y">
                        {p.items.map((w) => (
                          <WorkOrderRow key={w.id} w={w} />
                        ))}
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <Empty
                      icon={FolderOpen}
                      text="Nog geen werkbonnen. Vraag hierboven een afspraak aan."
                    />
                  </Card>
                )}
              </div>
            )}

            {tab === "facturen" && (
              <Card>
                {data.invoices.length ? (
                  <div className="divide-y">
                    {data.invoices.map((i) => (
                      <InvoiceRow key={i.id} i={i} />
                    ))}
                  </div>
                ) : (
                  <Empty icon={Receipt} text="Nog geen facturen." />
                )}
              </Card>
            )}

            {tab === "offertes" && (
              <Card>
                {data.quotes.length ? (
                  <div className="divide-y">
                    {data.quotes.map((q) => (
                      <div
                        key={q.id}
                        className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">
                              {q.kind === "verzekering" ? "Bestek" : "Offerte"} {q.number}
                            </span>
                            {q.signUrl ? (
                              <Pill className="bg-amber-50 text-amber-700">
                                Wacht op handtekening
                              </Pill>
                            ) : (
                              <Pill className="bg-emerald-50 text-emerald-700">Goedgekeurd</Pill>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(q.date)}
                            {q.signedAt ? ` · getekend ${formatDate(q.signedAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:justify-end">
                          <p className="font-semibold tabular-nums">{euro(q.total)}</p>
                          {q.signUrl ? (
                            <Button asChild size="sm">
                              <a href={q.signUrl}>Bekijken & tekenen</a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty icon={FileSignature} text="Geen offertes." />
                )}
              </Card>
            )}

            {tab === "afspraak" && (
              <Card className="p-5 sm:p-7">
                <form onSubmit={handleSubmitAppointment} className="mx-auto max-w-2xl space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">Nieuwe afspraak aanvragen</h2>
                    <p className="text-sm text-muted-foreground">
                      Beschrijf kort het probleem. Riory neemt contact op om een moment in te
                      plannen.
                    </p>
                  </div>
                  {data.customers.length > 1 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="pa-customer">Adres</Label>
                      <select
                        id="pa-customer"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                      >
                        {data.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} — {[c.street, c.house_number].filter(Boolean).join(" ")}
                            {c.city ? `, ${c.city}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="pa-desc">Wat is het probleem?</Label>
                    <Textarea
                      id="pa-desc"
                      required
                      minLength={5}
                      rows={4}
                      placeholder="Bv. wc loopt niet meer door, afvoer keuken verstopt…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="pa-window">Voorkeur moment (optioneel)</Label>
                      <Input
                        id="pa-window"
                        placeholder="Bv. dinsdag voormiddag"
                        value={preferredWindow}
                        onChange={(e) => setPreferredWindow(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pa-phone">Telefoon</Label>
                      <Input
                        id="pa-phone"
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pa-project">Project of referentie (optioneel)</Label>
                    <Input
                      id="pa-project"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3 rounded-xl bg-[#f6f5f2] p-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(v === true)} />{" "}
                      Dringend
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={worksiteDifferent}
                        onCheckedChange={(v) => setWorksiteDifferent(v === true)}
                      />{" "}
                      Werken op een ander adres
                    </label>
                    {worksiteDifferent && (
                      <div className="grid gap-3 pt-1 sm:grid-cols-[1fr_100px]">
                        <Input
                          placeholder="Straat"
                          value={worksiteStreet}
                          onChange={(e) => setWorksiteStreet(e.target.value)}
                          required
                        />
                        <Input
                          placeholder="Nr."
                          value={worksiteHouseNumber}
                          onChange={(e) => setWorksiteHouseNumber(e.target.value)}
                        />
                        <Input
                          placeholder="Postcode"
                          value={worksitePostalCode}
                          onChange={(e) => setWorksitePostalCode(e.target.value)}
                        />
                        <Input
                          placeholder="Gemeente"
                          value={worksiteCity}
                          onChange={(e) => setWorksiteCity(e.target.value)}
                          required
                        />
                      </div>
                    )}
                  </div>
                  <Button className="h-11 w-full font-semibold sm:w-auto" disabled={submitting}>
                    {submitting ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <CalendarPlus className="size-4" />
                    )}
                    Aanvraag versturen
                  </Button>
                </form>
              </Card>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
