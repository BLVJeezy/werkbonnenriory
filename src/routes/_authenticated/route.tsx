import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRole, useLargeText } from "@/lib/use-role";
import { largeTextOn, readDeviceChoice, writeDeviceChoice, type DeviceChoice } from "@/lib/text-size";
import { Menu, X } from "lucide-react";

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

const navCls = "rounded px-3 py-1.5";
const active = { className: "bg-primary text-primary-foreground" };

function Layout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useRole();
  const adminSet = useLargeText();
  const [device, setDevice] = useState<DeviceChoice>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const large = largeTextOn(adminSet, device);
  const { pathname } = useLocation();
  const marketingAllowed = ["/nieuwsbrieven", "/fotos", "/klanten"].some((p) => pathname.startsWith(p));
  useEffect(() => {
    if (role === "marketing" && !marketingAllowed) navigate({ to: "/nieuwsbrieven", replace: true });
  }, [role, marketingAllowed, navigate]);

  useEffect(() => {
    setDevice(readDeviceChoice());
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("large-text", large);
  }, [large]);
  useEffect(() => () => document.documentElement.classList.remove("large-text"), []);

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print border-b-4 border-primary bg-secondary text-secondary-foreground">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:flex sm:flex-wrap sm:gap-4 sm:px-4">
          <Link to="/werkbonnen" className="min-w-0 truncate text-lg font-black uppercase" onClick={() => setMenuOpen(false)}>
            Riory <span className="text-primary">Werkbonnen</span>
          </Link>
          <Button variant="secondary" size="icon" className="shrink-0 sm:hidden" aria-label={menuOpen ? "Menu sluiten" : "Menu openen"} aria-expanded={menuOpen} aria-controls="beheer-menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button>
          <nav id="beheer-menu" aria-label="Beheerpagina’s" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMenuOpen(false); }} className={`${menuOpen ? "grid" : "hidden"} col-span-full min-w-0 grid-cols-2 items-center gap-1 border-t border-secondary-foreground/20 pt-2 text-sm font-semibold sm:ml-auto sm:flex sm:flex-wrap sm:border-0 sm:pt-0`}>
            {role === "marketing" ? (
              <>
                <Link to="/nieuwsbrieven" className={navCls} activeProps={active}>Nieuwsbrieven</Link>
                <Link to="/klanten" className={navCls} activeProps={active}>Klanten</Link>
                <Link to="/fotos" className={navCls} activeProps={active}>Foto's</Link>
              </>
            ) : (
              <Link to="/werkbonnen" className={navCls} activeProps={active}>
                {role === "admin" ? "Taken" : "Mijn taken"}
              </Link>
            )}
            {role === "admin" && (
              <>
                <Link to="/kalender" className={navCls} activeProps={active}>
                  Kalender
                </Link>
                <Link to="/offertes" className={navCls} activeProps={active}>
                  Offertes
                </Link>
                <Link to="/contracten" className={navCls} activeProps={active}>Contracten</Link>
                <Link to="/facturen" className={navCls} activeProps={active}>
                  Facturen
                </Link>
                <Link to="/dashboard" className={navCls} activeProps={active}>
                  Dashboard
                </Link>
                <Link to="/klanten" className={navCls} activeProps={active}>
                  Klanten
                </Link>
                <Link to="/nieuwsbrieven" className={navCls} activeProps={active}>
                  Nieuwsbrieven
                </Link>
                <Link to="/leveranciers" className={navCls} activeProps={active}>
                  Leveranciers
                </Link>
                <Link to="/technici" className={navCls} activeProps={active}>
                  Ploegen
                </Link>
                <Link to="/producten" className={navCls} activeProps={active}>
                  Producten
                </Link>
                <Link to="/fotos" className={navCls} activeProps={active}>
                  Foto's
                </Link>
                <Link to="/tarieven" className={navCls} activeProps={active}>
                  Tarieven
                </Link>
              </>
            )}
            {role === "technician" && (
              <Button
                size="sm"
                variant={large ? "default" : "ghost"}
                aria-pressed={large}
                onClick={() => {
                  const next: DeviceChoice = large ? "off" : "on";
                  writeDeviceChoice(next);
                  setDevice(next);
                }}
              >
                <span aria-hidden className="font-mono leading-none">
                  Aa
                </span>
                Grote letters
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await qc.cancelQueries();
                qc.clear();
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              Uitloggen
            </Button>
          </nav>
        </div>
      </header>
      {role === "marketing" && !marketingAllowed ? null : <main className="mx-auto w-full min-w-0 max-w-5xl px-2 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>}
    </div>
  );
}
