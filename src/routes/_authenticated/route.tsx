import { SavingsQuarterAlert } from "@/components/SavingsQuarterAlert";
import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRole, useRoleError, useLargeText, usePerms, useEmployeeCrews } from "@/lib/use-role";
import { switchMyActiveCrew } from "@/lib/employee-crew.functions";
import { largeTextOn, textSizeStatus, readDeviceChoice, writeDeviceChoice, type DeviceChoice } from "@/lib/text-size";
import {
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Package,
  PackageCheck,
  Receipt,
  Settings,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { ScreenHelpPanel, ScreenHelpToggle } from "@/components/ScreenHelp";
import { OverdueAfterNoticeAlert } from "@/components/OverdueAfterNoticeAlert";
import { AdminNotifications } from "@/components/AdminNotifications";
import { GlobalSearch } from "@/components/GlobalSearch";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Keep crews signed in on weak mobile connections: a failed network check
    // must not count as signed out while a stored session still exists.
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) throw redirect({ to: "/auth" });
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return;
    const status = (error as { status?: number } | null)?.status;
    if (status === 401 || status === 403) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

const navCls =
  "group flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-secondary-foreground/80 transition-colors hover:bg-secondary-foreground/10 hover:text-secondary-foreground lg:min-h-9 lg:py-1.5";
const active = {
  className:
    "bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/90 hover:text-primary-foreground",
};

const PAGE_META: { prefix: string; group: string; label: string }[] = [
  { prefix: "/dashboard", group: "Overzicht", label: "Dashboard" },
  { prefix: "/kalender", group: "Overzicht", label: "Kalender" },
  { prefix: "/afgewerkte-werkbonnen", group: "Overzicht", label: "Afgewerkte werkbonnen" },
  { prefix: "/werkbonnen", group: "Overzicht", label: "Werkbon" },
  { prefix: "/interventiekaart", group: "Overzicht", label: "Interventiekaart" },
  { prefix: "/offertes", group: "Verkoop & Klanten", label: "Offertes" },
  { prefix: "/contracten", group: "Verkoop & Klanten", label: "Contracten" },
  { prefix: "/klanten", group: "Verkoop & Klanten", label: "Klanten" },
  { prefix: "/syndici", group: "Verkoop & Klanten", label: "Syndici" },
  { prefix: "/fotos", group: "Verkoop & Klanten", label: "Foto's" },
  { prefix: "/nieuwsbrieven", group: "Verkoop & Klanten", label: "Nieuwsbrieven" },
  { prefix: "/facturen", group: "Facturatie & Boekhouding", label: "Facturen" },
  { prefix: "/aankoopfacturen", group: "Facturatie & Boekhouding", label: "Aankoopfacturen" },
  { prefix: "/boekhouding", group: "Facturatie & Boekhouding", label: "Boekhouding" },
  { prefix: "/finance", group: "Facturatie & Boekhouding", label: "Finance" },
  { prefix: "/leveranciers", group: "Facturatie & Boekhouding", label: "Leveranciers" },
  { prefix: "/producten", group: "Beheer", label: "Producten" },
  { prefix: "/ploegproducten", group: "Beheer", label: "Producten per ploeg" },
  { prefix: "/medewerkers", group: "Beheer", label: "Medewerkers" },
  { prefix: "/instellingen", group: "Beheer", label: "Instellingen" },
  { prefix: "/handleiding", group: "Beheer", label: "Handleiding" },
];

function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useRole();
  const perms = usePerms();
  const adminSet = useLargeText();
  const { activeCrewId, allowedCrews } = useEmployeeCrews();
  const switchCrew = useServerFn(switchMyActiveCrew);
  const [switchingCrew, setSwitchingCrew] = useState(false);
  const [device, setDevice] = useState<DeviceChoice>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const large = largeTextOn(adminSet, device);
  const { pathname } = useLocation();
  const fullScreen = pathname === '/medewerkers';
  const currentMeta = PAGE_META.find((m) => pathname.startsWith(m.prefix));
  const marketingAllowed = ["/nieuwsbrieven", "/fotos", "/klanten"].some((p) => pathname.startsWith(p));
  useEffect(() => {
    if (role === "marketing" && !marketingAllowed) navigate({ to: "/nieuwsbrieven", replace: true });
  }, [role, marketingAllowed, pathname, navigate]);
  const meError = useRoleError();

  useEffect(() => {
    setDevice(readDeviceChoice());
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("large-text", large);
  }, [large]);
  useEffect(() => () => document.documentElement.classList.remove("large-text"), []);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const navLabel = (text: string, isMobile: boolean) =>
    !isMobile && collapsed ? <span className="sr-only">{text}</span> : <span className="truncate">{text}</span>;

  const groupTitle = (text: string, isMobile: boolean) =>
    !isMobile && collapsed ? (
      <div className="my-2 border-t border-secondary-foreground/12" />
    ) : (
      <p className="mb-1 mt-4 px-2.5 text-[11px] font-bold uppercase tracking-wider text-secondary-foreground/50 first:mt-0">
        {text}
      </p>
    );

  const renderNav = (isMobile: boolean) => (
    <nav
      id={isMobile ? "beheer-menu" : undefined}
      aria-label="Beheerpagina’s"
      onClick={(e) => {
        if (isMobile && (e.target as HTMLElement).closest("a")) setMenuOpen(false);
      }}
      className="flex-1 overflow-y-auto px-2.5 py-3"
    >
      {role === "marketing" ? (
        <div className="space-y-0.5">
          {groupTitle("Marketing", isMobile)}
          <Link to="/nieuwsbrieven" className={navCls} activeProps={active} title="Nieuwsbrieven">
            <Mail className="h-4 w-4 shrink-0" />
            {navLabel("Nieuwsbrieven", isMobile)}
          </Link>
          <Link to="/klanten" className={navCls} activeProps={active} title="Klanten">
            <Users className="h-4 w-4 shrink-0" />
            {navLabel("Klanten", isMobile)}
          </Link>
          <Link to="/fotos" className={navCls} activeProps={active} title="Foto's">
            <Camera className="h-4 w-4 shrink-0" />
            {navLabel("Foto's", isMobile)}
          </Link>
          {groupTitle("Ondersteuning", isMobile)}
          <Link to="/handleiding" className={navCls} activeProps={active} title="Handleiding">
            <BookOpen className="h-4 w-4 shrink-0" />
            {navLabel("Handleiding", isMobile)}
          </Link>
        </div>
      ) : (
        <div className="space-y-0.5">
          {groupTitle("Overzicht", isMobile)}
          {role === "admin" && (
            <Link to="/dashboard" className={navCls} activeProps={active} title="Dashboard">
              <BarChart3 className="h-4 w-4 shrink-0" />
              {navLabel("Dashboard", isMobile)}
            </Link>
          )}
          {(role === "admin" || role === "technician") && (
            <Link to="/kalender" className={navCls} activeProps={active} title="Kalender">
              <CalendarDays className="h-4 w-4 shrink-0" />
              {navLabel("Kalender", isMobile)}
            </Link>
          )}
          {(role === "admin" || (role === "technician" && perms?.showSigned)) && (
            <Link to="/afgewerkte-werkbonnen" className={navCls} activeProps={active} title="Afgewerkte werkbonnen">
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              {navLabel("Afgewerkte werkbonnen", isMobile)}
            </Link>
          )}
          {role === "admin" && (
            <Link to="/interventiekaart" className={navCls} activeProps={active} title="Interventiekaart">
              <MapPin className="h-4 w-4 shrink-0" />
              {navLabel("Interventiekaart", isMobile)}
            </Link>
          )}

          {role === "admin" && (
            <>
              {groupTitle("Verkoop & Klanten", isMobile)}
              <Link to="/offertes" className={navCls} activeProps={active} title="Offertes">
                <FileText className="h-4 w-4 shrink-0" />
                {navLabel("Offertes", isMobile)}
              </Link>
              <Link to="/contracten" className={navCls} activeProps={active} title="Contracten">
                <FileCheck2 className="h-4 w-4 shrink-0" />
                {navLabel("Contracten", isMobile)}
              </Link>
              <Link to="/klanten" className={navCls} activeProps={active} title="Klanten">
                <Users className="h-4 w-4 shrink-0" />
                {navLabel("Klanten", isMobile)}
              </Link>
              <Link to="/syndici" className={navCls} activeProps={active} title="Syndici">
                <Building2 className="h-4 w-4 shrink-0" />
                {navLabel("Syndici", isMobile)}
              </Link>
              <Link to="/fotos" className={navCls} activeProps={active} title="Foto's">
                <Camera className="h-4 w-4 shrink-0" />
                {navLabel("Foto's", isMobile)}
              </Link>
              <Link to="/nieuwsbrieven" className={navCls} activeProps={active} title="Nieuwsbrieven">
                <Mail className="h-4 w-4 shrink-0" />
                {navLabel("Nieuwsbrieven", isMobile)}
              </Link>

              {groupTitle("Facturatie & Boekhouding", isMobile)}
              <Link to="/facturen" className={navCls} activeProps={active} title="Facturen">
                <Receipt className="h-4 w-4 shrink-0" />
                {navLabel("Facturen", isMobile)}
              </Link>
              <Link to="/aankoopfacturen" className={navCls} activeProps={active} title="Aankoopfacturen">
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                {navLabel("Aankoopfacturen", isMobile)}
              </Link>
              <Link to="/boekhouding" search={{ tab: "rekeningen" }} className={navCls} activeProps={active} title="Boekhouding">
                <Calculator className="h-4 w-4 shrink-0" />
                {navLabel("Boekhouding", isMobile)}
              </Link>
              <Link to="/finance" search={{ tab: "overzicht", id: undefined, maand: undefined }} className={navCls} activeProps={active} title="Finance">
                <Wallet className="h-4 w-4 shrink-0" />
                {navLabel("Finance", isMobile)}
              </Link>
              <Link to="/leveranciers" className={navCls} activeProps={active} title="Leveranciers">
                <Truck className="h-4 w-4 shrink-0" />
                {navLabel("Leveranciers", isMobile)}
              </Link>

              {groupTitle("Beheer", isMobile)}
              <Link to="/producten" className={navCls} activeProps={active} title="Producten">
                <Package className="h-4 w-4 shrink-0" />
                {navLabel("Producten", isMobile)}
              </Link>
              <Link to="/ploegproducten" className={navCls} activeProps={active} title="Producten per ploeg">
                <PackageCheck className="h-4 w-4 shrink-0" />
                {navLabel("Producten per ploeg", isMobile)}
              </Link>
              <Link to="/medewerkers" className={navCls} activeProps={active} title="Medewerkers">
                <Users className="h-4 w-4 shrink-0" />
                {navLabel("Medewerkers", isMobile)}
              </Link>
              <Link to="/instellingen" className={navCls} activeProps={active} title="Instellingen">
                <Settings className="h-4 w-4 shrink-0" />
                {navLabel("Instellingen", isMobile)}
              </Link>
            </>
          )}

          {role !== "admin" && groupTitle("Ondersteuning", isMobile)}
          <Link to="/handleiding" className={navCls} activeProps={active} title="Handleiding">
            <BookOpen className="h-4 w-4 shrink-0" />
            {navLabel("Handleiding", isMobile)}
          </Link>
        </div>
      )}
    </nav>
  );

  return (
    <div className={fullScreen ? "flex h-dvh min-h-0 overflow-hidden bg-background" : "flex min-h-screen bg-background"}>
      {role === "admin" && <AdminNotifications />}

      {/* Desktop Sidebar */}
      <aside
        className={`no-print hidden shrink-0 flex-col border-r border-secondary-foreground/10 bg-secondary text-secondary-foreground transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-secondary-foreground/12 px-3">
          <Link
            to={role === "admin" ? "/dashboard" : role === "marketing" ? "/nieuwsbrieven" : "/kalender"}
            className="flex min-w-0 items-center gap-2.5"
          >
            <img src="/favicon.png" alt="Riory" className="h-8 w-8 shrink-0 rounded-md bg-white/95 p-0.5" />
            {!collapsed && (
              <span className="truncate text-base font-black uppercase tracking-tight">
                Riory <span className="text-primary">Werkbonnen</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            aria-label={collapsed ? "Zijbalk uitklappen" : "Zijbalk inklappen"}
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-secondary-foreground/70 transition-colors hover:bg-secondary-foreground/10 hover:text-secondary-foreground"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {renderNav(false)}

        <div className="shrink-0 border-t border-secondary-foreground/12 p-2.5">
          <button
            type="button"
            onClick={signOut}
            title="Uitloggen"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-secondary-foreground/80 transition-colors hover:bg-secondary-foreground/10 hover:text-secondary-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Uitloggen</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {menuOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-foreground/50 backdrop-blur-[1px]" aria-hidden onClick={() => setMenuOpen(false)} />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-secondary text-secondary-foreground shadow-xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-secondary-foreground/12 px-4">
              <Link
                to={role === "admin" ? "/dashboard" : role === "marketing" ? "/nieuwsbrieven" : "/kalender"}
                className="flex min-w-0 items-center gap-2.5"
                onClick={() => setMenuOpen(false)}
              >
                <img src="/favicon.png" alt="Riory" className="h-8 w-8 shrink-0 rounded-md bg-white/95 p-0.5" />
                <span className="truncate text-base font-black uppercase tracking-tight">
                  Riory <span className="text-primary">Werkbonnen</span>
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-secondary-foreground hover:bg-secondary-foreground/10"
                aria-label="Menu sluiten"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {renderNav(true)}
            <div className="shrink-0 border-t border-secondary-foreground/12 p-3">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2.5 text-secondary-foreground hover:bg-secondary-foreground/10"
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" />
                Uitloggen
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className={fullScreen ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "flex min-w-0 flex-1 flex-col"}>
        {/* Top Utility Header */}
        <header className="no-print sticky top-0 z-30 shrink-0 border-b border-border/80 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 lg:hidden"
                aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
                aria-expanded={menuOpen}
                aria-controls="beheer-menu"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </Button>
              <div className="flex min-w-0 items-center gap-1.5 text-sm">
                {currentMeta ? (
                  <>
                    <span className="hidden text-muted-foreground sm:inline">{currentMeta.group}</span>
                    <span className="hidden text-muted-foreground/50 sm:inline">/</span>
                    <span className="truncate font-bold text-foreground">{currentMeta.label}</span>
                  </>
                ) : (
                  <span className="truncate font-bold text-foreground">Riory Werkbonnen</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <GlobalSearch />
              {role === "technician" && allowedCrews.length > 1 && (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <span className="hidden sm:inline">Actieve ploeg:</span>
                  <select
                    aria-label="Actieve ploeg kiezen"
                    className="h-9 rounded-md border border-input bg-card px-2.5 text-sm text-foreground"
                    value={activeCrewId ?? ""}
                    disabled={switchingCrew}
                    onChange={async (e) => {
                      const nextId = e.target.value;
                      if (!nextId) return;
                      setSwitchingCrew(true);
                      try {
                        await switchCrew({ data: { technicianId: nextId } });
                        await qc.invalidateQueries();
                        const chosen = allowedCrews.find((c) => c.id === nextId);
                        toast.success(`Overgeschakeld naar ${chosen?.name ?? "ploeg"}`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Ploeg wisselen mislukt");
                      } finally {
                        setSwitchingCrew(false);
                      }
                    }}
                  >
                    {!activeCrewId && <option value="">Kies een ploeg…</option>}
                    {allowedCrews.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                size="sm"
                variant={large ? "default" : "outline"}
                role="switch"
                aria-checked={large}
                aria-describedby="tekstgrootte-uitleg"
                onClick={() => {
                  const next: DeviceChoice = large ? "off" : "on";
                  writeDeviceChoice(next);
                  setDevice(next);
                }}
              >
                <span aria-hidden className="font-mono leading-none">Aa</span>
                <span className="hidden sm:inline">Grote letters:</span> {large ? "AAN" : "UIT"}
              </Button>
              {device !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    writeDeviceChoice(null);
                    setDevice(null);
                  }}
                >
                  Tekstgrootte terugzetten
                </Button>
              )}
              <span id="tekstgrootte-uitleg" className="sr-only sm:not-sr-only sm:text-xs sm:text-muted-foreground">
                {textSizeStatus(adminSet, device)}
              </span>
              {role === "admin" && <ScreenHelpToggle />}
            </div>
          </div>
        </header>

        {role === "admin" && !fullScreen && <ScreenHelpPanel />}

        {meError ? (
          <main className="mx-auto max-w-xl px-4 py-12 text-center">
            <p role="alert" className="font-semibold">Je gegevens konden niet geladen worden.</p>
            <p className="mt-1 text-sm text-muted-foreground">Controleer je internetverbinding en probeer opnieuw.</p>
            <Button className="mt-4" onClick={() => qc.invalidateQueries({ queryKey: ["my_role"] })}>Opnieuw proberen</Button>
          </main>
        ) : role === null ? (
          <main className="mx-auto max-w-xl px-4 py-12 text-center text-sm text-muted-foreground">Laden…</main>
        ) : role === "marketing" && !marketingAllowed ? (
          <main className="mx-auto max-w-xl px-4 py-12 text-center">
            <p className="font-semibold">Deze pagina is niet beschikbaar voor jouw account.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button asChild><Link to="/nieuwsbrieven">Nieuwsbrieven</Link></Button>
              <Button asChild variant="outline"><Link to="/klanten">Klanten</Link></Button>
              <Button asChild variant="outline"><Link to="/fotos">Foto's</Link></Button>
            </div>
          </main>
        ) : (
          <main className={fullScreen ? "min-h-0 w-full min-w-0 flex-1 overflow-hidden" : "mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 py-5 sm:px-6 sm:py-6"}>
            <Outlet />
          </main>
        )}
      </div>

      {role === "admin" && <OverdueAfterNoticeAlert />}
      {role === "admin" && <SavingsQuarterAlert />}
    </div>
  );
}
