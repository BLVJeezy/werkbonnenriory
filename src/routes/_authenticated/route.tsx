import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-primary bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link to="/werkbonnen" className="text-lg font-black uppercase tracking-tight">
            Riory <span className="text-primary">Werkbonnen</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm font-semibold">
            <Link to="/werkbonnen" className="rounded px-3 py-1.5" activeProps={{ className: "bg-primary text-primary-foreground" }}>
              Werkbonnen
            </Link>
            <Link to="/technici" className="rounded px-3 py-1.5" activeProps={{ className: "bg-primary text-primary-foreground" }}>
              Technici
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
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
