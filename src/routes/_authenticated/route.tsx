import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRole, useLargeText } from "@/lib/use-role";
import { largeTextOn, readDeviceChoice, writeDeviceChoice, type DeviceChoice } from "@/lib/text-size";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
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
  const large = largeTextOn(adminSet, device);

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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/werkbonnen" className="text-lg font-black uppercase tracking-tight">
            Riory <span className="text-primary">Werkbonnen</span>
          </Link>
          <nav className="ml-auto flex flex-wrap items-center gap-1 text-sm font-semibold">
            <Link to="/werkbonnen" className={navCls} activeProps={active}>
              {role === "admin" ? "Taken" : "Mijn taken"}
            </Link>
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
                <Link to="/klanten" className={navCls} activeProps={active}>
                  Klanten
                </Link>
                <Link to="/technici" className={navCls} activeProps={active}>
                  Ploegen
                </Link>
                <Link to="/producten" className={navCls} activeProps={active}>
                  Producten
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
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
