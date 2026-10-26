import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/use-role";

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
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-primary bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/werkbonnen" className="text-lg font-black uppercase tracking-tight">
            Riory <span className="text-primary">Werkbonnen</span>
          </Link>
          <nav className="ml-auto flex flex-wrap items-center gap-1 text-sm font-semibold">
            <Link to="/werkbonnen" className={navCls} activeProps={active}>
              {role === "admin" ? "Werkbonnen" : "Mijn taken"}
            </Link>
            {role === "admin" && (
              <>
                <Link to="/technici" className={navCls} activeProps={active}>
                  Technici
                </Link>
                <Link to="/producten" className={navCls} activeProps={active}>
                  Producten
                </Link>
                <Link to="/tarieven" className={navCls} activeProps={active}>
                  Tarieven
                </Link>
              </>
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
