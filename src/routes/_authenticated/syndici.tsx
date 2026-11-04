import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { allCustomers } from "@/lib/customers";
import { formatAddress } from "@/lib/address";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/syndici")({
  head: () => ({ meta: [{ title: "Syndici — Riory Werkbonnen" }, { name: "description", content: "Overzicht van elke syndicus met de VME's die erbij horen." }, { property: "og:title", content: "Syndici — Riory Werkbonnen" }, { property: "og:description", content: "Overzicht van elke syndicus met de VME's die erbij horen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Syndici,
});

function Syndici() {
  const { data = [] } = useQuery({ queryKey: ["customers"], queryFn: () => allCustomers(supabase) });

  const groups = useMemo(() => {
    const byName = new Map<string, { label: string; rows: typeof data; template: (typeof data)[number] | null }>();
    for (const c of data) {
      const company = (c.syndicus_company as string | null)?.trim();
      const key = company || (c.syndicus as string | null)?.trim();
      if (!key) continue;
      const g = byName.get(key) ?? { label: (c.syndicus as string | null)?.trim() || key, rows: [], template: null };
      g.rows.push(c);
      const filled = !!(c.syndicus_street || c.syndicus_email || c.syndicus_phone || c.syndicus_vat_number || c.syndicus_billing_email);
      if (!g.template && (filled || !g.rows.some((r) => r.id !== c.id))) g.template = c;
      byName.set(key, g);
    }
    return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label, "nl"));
  }, [data]);

  const withSyndicus = groups.reduce((n, g) => n + g.rows.length, 0);
  const withoutSyndicus = data.length - withSyndicus;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-3xl font-black uppercase">Syndici</h1>
        <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/klanten">Naar klanten</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {groups.length} syndicus{groups.length === 1 ? "" : "i"} met samen {withSyndicus} klant{withSyndicus === 1 ? "" : "en"}.
        {withoutSyndicus > 0 && <> Nog {withoutSyndicus.toLocaleString("nl-BE")} klant{withoutSyndicus === 1 ? "" : "en"} {withoutSyndicus === 1 ? "heeft" : "hebben"} geen syndicus; vink die in bij <Link to="/klanten" className="underline">Klanten</Link> en klik <strong className="font-semibold text-foreground">Syndicus toewijzen</strong>.</>}
      </p>

      {groups.length === 0 && <div className="rounded-md border bg-card p-6 text-muted-foreground">Nog geen syndici bekend. Wijs een syndicus toe bij een klant, of selecteer meerdere VME's bij Klanten en klik <strong className="font-semibold text-foreground">Syndicus toewijzen</strong>.</div>}

      {groups.map((g) => {
        const t = g.template ?? g.rows[0];
        const details: [string, string | null][] = [
          ["Contactpersoon", (t.syndicus_contact as string | null) ?? null],
          ["Btw-nummer", (t.syndicus_vat_number as string | null) ?? null],
          ["Adres", t.syndicus_street || t.syndicus_city ? formatAddress({ street: t.syndicus_street, house_number: t.syndicus_house_number, postal_code: t.syndicus_postal_code, city: t.syndicus_city }) : null],
          ["Telefoon", (t.syndicus_phone as string | null) ?? null],
          ["E-mail", (t.syndicus_email as string | null) ?? null],
          ["E-mail boekhouding", (t.syndicus_billing_email as string | null) ?? null],
        ];
        return (
          <section key={g.label} className="rounded-md border bg-card p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-black uppercase">{g.label}</h2>
              <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-bold">{g.rows.length} VME{g.rows.length > 1 ? "'s" : ""}</span>
              <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/klanten" search={{ q: g.label }}>Bewerken</Link></Button>
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="min-w-36 text-xs font-bold uppercase text-muted-foreground">{label}</dt>
                  <dd className={value ? "font-semibold" : "text-muted-foreground"}>{value || "nog niet ingevuld"}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-4 border-t text-sm [&>li]:flex [&>li]:flex-wrap [&>li]:items-baseline [&>li]:gap-x-2 [&>li]:border-t [&>li]:py-1.5">
              {g.rows.map((c) => (
                <li key={c.id}>
                  <span className="font-mono text-xs text-muted-foreground">{c.customer_number ?? "—"}</span>
                  <span className="font-bold">{c.name}</span>
                  <span className="text-muted-foreground">{formatAddress(c) || "geen adres"}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
