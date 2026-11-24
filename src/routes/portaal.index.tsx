import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarPlus, ClipboardList, FileText, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RIORY_WEBSITE_URL } from "@/lib/customer-portal";
import { getPortalOverview, submitPortalAppointmentRequest } from "@/lib/customer-portal.functions";

export const Route = createFileRoute("/portaal/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Klantenportaal — Riory" },
      { name: "description", content: "Vraag een afspraak aan en bekijk uw interventies en facturen bij Riory." },
      { property: "og:title", content: "Klantenportaal — Riory" },
      { property: "og:description", content: "Vaste-klantenportaal van Riory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalHomePage,
});

type Overview = Awaited<ReturnType<typeof getPortalOverview>>;

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("nl-BE");
}

function workOrderStatusLabel(status: string, scheduledDate: string | null): string {
  if (status === "completed") return "Afgerond";
  if (scheduledDate) return `Ingepland (${formatDate(scheduledDate)})`;
  return "In aanvraag";
}

function PortalHomePage() {
  const navigate = useNavigate();
  const loadOverview = useServerFn(getPortalOverview);
  const submitRequest = useServerFn(submitPortalAppointmentRequest);

  const [tab, setTab] = useState<"afspraak" | "opdrachten" | "facturen">("opdrachten");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Appointment request form state
  const [description, setDescription] = useState("");
  const [preferredWindow, setPreferredWindow] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [projectName, setProjectName] = useState("");
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
      if (res.customer.phone && !contactPhone) setContactPhone(res.customer.phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portaalgegevens konden niet worden geladen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("actie") === "afspraak") setTab("afspraak");
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/portaal/inloggen" });
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
          urgent,
          worksiteDifferent,
          worksiteStreet: worksiteDifferent ? worksiteStreet : undefined,
          worksiteHouseNumber: worksiteDifferent ? worksiteHouseNumber : undefined,
          worksitePostalCode: worksiteDifferent ? worksitePostalCode : undefined,
          worksiteCity: worksiteDifferent ? worksiteCity : undefined,
        },
      });
      toast.success("Uw afspraakaanvraag is ontvangen. Riory plant deze zo snel mogelijk in.");
      setDescription("");
      setPreferredWindow("");
      setProjectName("");
      setUrgent(false);
      setWorksiteDifferent(false);
      setWorksiteStreet("");
      setWorksiteHouseNumber("");
      setWorksitePostalCode("");
      setWorksiteCity("");
      setTab("opdrachten");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aanvraag verzenden mislukt.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-lg font-black uppercase tracking-tight">
              Riory <span className="text-primary">Klantenportaal</span>
            </p>
            {data && (
              <p className="text-xs text-secondary-foreground/80">
                {data.customer.name} · {data.accountEmail}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="bg-card text-foreground">
              <a href={RIORY_WEBSITE_URL}>
                <ArrowLeft className="mr-1.5 size-4" />
                riory.be
              </a>
            </Button>
            <Button variant="outline" size="sm" className="bg-card text-foreground" onClick={handleLogout}>
              <LogOut className="mr-1.5 size-4" />
              Uitloggen
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Uw gegevens worden geladen…</p>
        ) : error ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-card p-5">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Opnieuw inloggen
            </Button>
          </div>
        ) : data ? (
          <>
            <nav className="flex flex-wrap gap-2">
              <Button variant={tab === "afspraak" ? "default" : "outline"} onClick={() => setTab("afspraak")}>
                <CalendarPlus className="mr-1.5 size-4" />
                Afspraak aanvragen
              </Button>
              <Button variant={tab === "opdrachten" ? "default" : "outline"} onClick={() => setTab("opdrachten")}>
                <ClipboardList className="mr-1.5 size-4" />
                Mijn afspraken ({data.workOrders.length})
              </Button>
              <Button variant={tab === "facturen" ? "default" : "outline"} onClick={() => setTab("facturen")}>
                <FileText className="mr-1.5 size-4" />
                Mijn facturen ({data.invoices.length})
              </Button>
            </nav>

            {tab === "afspraak" && (
              <section className="rounded-xl border bg-card p-5 shadow-xs">
                <h1 className="text-lg font-bold">Nieuwe afspraak aanvragen</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Uw aanvraag komt rechtstreeks in de Riory-planning terecht. Uw klantgegevens worden automatisch gekoppeld.
                </p>
                <form onSubmit={handleSubmitAppointment} className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="portal-desc">Omschrijving van de werken of het probleem *</Label>
                    <Textarea
                      id="portal-desc"
                      required
                      minLength={5}
                      rows={4}
                      placeholder="Beschrijf zo duidelijk mogelijk wat er moet gebeuren…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="portal-window">Voorkeur dag / dagdeel (optioneel)</Label>
                      <Input
                        id="portal-window"
                        placeholder="bv. donderdag voormiddag"
                        value={preferredWindow}
                        onChange={(e) => setPreferredWindow(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="portal-phone">Contacttelefoon</Label>
                      <Input
                        id="portal-phone"
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="portal-project">Referentie of projectnaam (optioneel)</Label>
                    <Input
                      id="portal-project"
                      placeholder="bv. Residentie of gebouw"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={urgent} onCheckedChange={(v) => setUrgent(v === true)} />
                      Dringende interventie
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={worksiteDifferent} onCheckedChange={(v) => setWorksiteDifferent(v === true)} />
                      Ander werfadres dan factuuradres
                    </label>
                  </div>
                  {worksiteDifferent && (
                    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-4">
                      <div className="space-y-1 sm:col-span-3">
                        <Label htmlFor="ws-street">Straat</Label>
                        <Input id="ws-street" required value={worksiteStreet} onChange={(e) => setWorksiteStreet(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ws-nr">Nr.</Label>
                        <Input id="ws-nr" required value={worksiteHouseNumber} onChange={(e) => setWorksiteHouseNumber(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ws-zip">Postcode</Label>
                        <Input id="ws-zip" required value={worksitePostalCode} onChange={(e) => setWorksitePostalCode(e.target.value)} />
                      </div>
                      <div className="space-y-1 sm:col-span-3">
                        <Label htmlFor="ws-city">Plaats</Label>
                        <Input id="ws-city" required value={worksiteCity} onChange={(e) => setWorksiteCity(e.target.value)} />
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Verzenden…" : "Afspraakaanvraag indienen"}
                  </Button>
                </form>
              </section>
            )}

            {tab === "opdrachten" && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h1 className="text-lg font-bold">Mijn afspraken &amp; werkbonnen</h1>
                  <Button size="sm" onClick={() => setTab("afspraak")}>
                    <CalendarPlus className="mr-1.5 size-4" />
                    Nieuwe afspraak
                  </Button>
                </div>
                {data.workOrders.length === 0 ? (
                  <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
                    Er zijn nog geen afspraken of werkbonnen gekoppeld aan uw account.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {data.workOrders.map((wo) => {
                      const addr = [
                        wo.site_street ?? wo.street,
                        wo.site_house_number ?? wo.house_number,
                        wo.site_postal_code ?? wo.postal_code,
                        wo.site_city ?? wo.city,
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <article key={wo.id} className="rounded-lg border bg-card p-4 shadow-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold">
                              {wo.number ? `Werkbon #${wo.number}` : "Afspraakaanvraag"}
                              {wo.project_name ? ` — ${wo.project_name}` : ""}
                            </p>
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                              {workOrderStatusLabel(wo.status, wo.scheduled_date)}
                            </span>
                          </div>
                          {addr && <p className="mt-1 text-xs text-muted-foreground">{addr}</p>}
                          {wo.description && (
                            <p className="mt-2 whitespace-pre-line text-sm text-foreground/90">{wo.description}</p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {tab === "facturen" && (
              <section className="space-y-3">
                <h1 className="text-lg font-bold">Mijn facturen</h1>
                {data.invoices.length === 0 ? (
                  <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
                    Er zijn nog geen verzonden facturen beschikbaar.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-card">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5">Nummer</th>
                          <th className="px-4 py-2.5">Datum</th>
                          <th className="px-4 py-2.5">Vervaldatum</th>
                          <th className="px-4 py-2.5 text-right">Bedrag incl. btw</th>
                          <th className="px-4 py-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="px-4 py-2.5 font-mono font-medium">
                              {inv.kind === "credit_note" ? `CN ${inv.number}` : inv.number}
                            </td>
                            <td className="px-4 py-2.5">{formatDate(inv.issue_date)}</td>
                            <td className="px-4 py-2.5">{formatDate(inv.due_date)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              € {Number(inv.total ?? 0).toFixed(2).replace(".", ",")}
                            </td>
                            <td className="px-4 py-2.5">
                              {inv.status === "paid" ? "Betaald" : inv.status === "sent" ? "Openstaand" : inv.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}