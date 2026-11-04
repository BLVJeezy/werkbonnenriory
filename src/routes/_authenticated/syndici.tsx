import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { allCustomers } from "@/lib/customers";
import { formatAddress } from "@/lib/address";
import { SortTh, Th, tableCls, useSort } from "@/components/SortTable";
import { filterChoices } from "@/lib/choice-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteSyndicus, saveSyndicus } from "@/lib/syndici.functions";
import {
  SYNDICUS_DIR_FIELDS,
  dirFromCustomer,
  residentiesOverzicht,
  syndicusGroups,
  type ResidentyRij,
  type SyndicusDir,
  type SyndicusDirField,
  type SyndicusDirInput,
} from "@/lib/syndici";

export const Route = createFileRoute("/_authenticated/syndici")({
  head: () => ({ meta: [{ title: "Syndici — Riory Werkbonnen" }, { name: "description", content: "Overzicht van elke syndicus met de VME's die erbij horen, en een fiche om er zelf aan te maken." }, { property: "og:title", content: "Syndici — Riory Werkbonnen" }, { property: "og:description", content: "Overzicht van elke syndicus met de VME's die erbij horen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Syndici,
});

const DIR_FIELDS: { key: SyndicusDirField; label: string; className: string; hint?: string }[] = [
  { key: "company", label: "Bedrijfsnaam", className: "min-w-48 flex-[2]", hint: "Bijv. Immo Schrijnemakers BV" },
  { key: "contact", label: "Contactpersoon", className: "min-w-40 flex-1", hint: "Bijv. Olivier Schrijnemakers" },
  { key: "vat_number", label: "Btw-nummer", className: "w-44", hint: "BE0…" },
  { key: "street", label: "Straat", className: "min-w-40 flex-[2]" },
  { key: "house_number", label: "Nr.", className: "w-24" },
  { key: "postal_code", label: "Postcode", className: "w-32" },
  { key: "city", label: "Plaats", className: "min-w-36 flex-1" },
  { key: "phone", label: "Telefoon", className: "w-40" },
  { key: "email", label: "E-mail", className: "min-w-44 flex-1", hint: "info@…" },
  { key: "billing_email", label: "E-mail boekhouding", className: "min-w-44 flex-1", hint: "boekhouding@…" },
];

const LEEG = Object.fromEntries(SYNDICUS_DIR_FIELDS.map((f) => [f, ""])) as SyndicusDirInput;

/** De klant met de meeste syndicusgegevens als bron voor een nieuwe fiche. */
function ausDerKlant(rows: Record<string, unknown>[]): SyndicusDirInput {
  const bron =
    rows.find((r) => r["syndicus_street"] || r["syndicus_email"] || r["syndicus_phone"] || r["syndicus_vat_number"] || r["syndicus_billing_email"]) ??
    rows[0];
  return bron ? dirFromCustomer(bron) : LEEG;
}

function Fiche({
  id,
  title,
  saveLabel,
  initial,
  onSaved,
  onCancel,
}: {
  id?: string | null;
  title: string;
  saveLabel: string;
  initial: SyndicusDirInput;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SyndicusDirInput>(initial);
  const [busy, setBusy] = useState(false);

  async function bewaar() {
    if (!form.company?.trim()) {
      toast.error("Vul de bedrijfsnaam van de syndicus in.");
      return;
    }
    setBusy(true);
    try {
      await saveSyndicus({ data: { id: id ?? null, ...form } });
      toast.success(`${form.company.trim()} bewaard`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bewaren lukte niet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-black uppercase tracking-wide text-primary">{title}</h2>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Annuleren
          </Button>
          <Button size="sm" onClick={bewaar} disabled={busy}>
            {busy ? "Bezig…" : saveLabel}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {DIR_FIELDS.map((f) => (
          <label key={f.key} className={`space-y-1 ${f.className}`}>
            <span className="block text-xs font-bold uppercase text-muted-foreground">
              {f.label}
              {f.key === "company" && " *"}
            </span>
            <Input
              value={(form[f.key] as string | null) ?? ""}
              placeholder={f.hint}
              onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Het btw-nummer van de syndicus staat apart en komt nooit op de factuur van de VME.
      </p>
    </div>
  );
}

/** Wat het overzicht nodig heeft; de rijen komen uit de klantenlijst. */
type Residentie = {
  id: string;
  name: string;
  customer_number?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
};

/** Eén lijst met alle residenties, elk met de syndicus die erbij hoort. */
function ResidentiesOverzicht({ rijen }: { rijen: ResidentyRij<Residentie>[] }) {
  const [q, setQ] = useState("");
  const gevonden = useMemo(() => {
    const keuzes = rijen.map((r) => ({
      value: r.klant.id,
      label: r.klant.name,
      search: [
        r.syndicus,
        r.klant.customer_number,
        r.klant.street,
        r.klant.house_number,
        r.klant.postal_code,
        r.klant.city,
      ]
        .filter(Boolean)
        .join(" "),
    }));
    const ids = new Set(filterChoices(keuzes, q).map((k) => k.value));
    return rijen.filter((r) => ids.has(r.klant.id));
  }, [rijen, q]);
  const sort = useSort(
    gevonden,
    {
      residentie: (r) => r.klant.name,
      nr: (r) => r.klant.customer_number,
      syndicus: (r) => r.syndicus,
    },
    "residentie",
  );

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-black uppercase tracking-wide">Alle residenties op een rij</h2>
        <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-bold">
          {rijen.length} residentie{rijen.length === 1 ? "" : "s"}
        </span>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek residentie, adres of syndicus"
          className="ml-auto w-full sm:w-72"
        />
      </div>
      {rijen.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nog geen residentie met syndicus. Wijs er een toe bij{" "}
          <Link to="/klanten" className="underline">
            Klanten
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3 max-h-[32rem] overflow-auto rounded-md border bg-card">
          <table className={tableCls}>
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr>
                      <SortTh k="residentie" sort={sort}>
                        Residentie
                      </SortTh>
                      <SortTh k="nr" sort={sort}>
                        Klantnr.
                      </SortTh>
                      <Th className="hidden sm:table-cell">Adres</Th>
                      <SortTh k="syndicus" sort={sort}>
                        Syndicus
                      </SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sort.sorted.map((r) => (
                      <tr key={r.klant.id}>
                        <td className="font-bold">
                          {r.klant.name}
                          <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                            {formatAddress(r.klant) || "geen adres"}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-muted-foreground">{r.klant.customer_number ?? "—"}</td>
                        <td className="hidden text-muted-foreground sm:table-cell">{formatAddress(r.klant) || "geen adres"}</td>
                        <td>
                          <a
                            href={`#syndicus-${encodeURIComponent(r.key)}`}
                            className="font-semibold underline [overflow-wrap:anywhere]"
                          >
                            {r.syndicus}
                          </a>
                        </td>
                      </tr>
                    ))}
                    {sort.sorted.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-muted-foreground">
                          Geen residentie gevonden voor “{q}”.
                        </td>
                      </tr>
                    )}
                  </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Syndici() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["customers"], queryFn: () => allCustomers(supabase) });
  const { data: directory = [] } = useQuery({
    queryKey: ["syndici"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("syndici").select("*").order("company");
      if (error) throw new Error(error.message);
      return (rows ?? []) as SyndicusDir[];
    },
  });
  const groups = useMemo(() => syndicusGroups(data, directory), [data, directory]);
  const rijen = useMemo(() => residentiesOverzicht(groups), [groups]);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // De residentielijst van een syndicus is ingeklapt tenzij hier aan staat.
  const [openVme, setOpenVme] = useState<Record<string, boolean>>({});

  function toggleResidenties(key: string) {
    setOpenVme((p) => ({ ...p, [key]: !p[key] }));
  }

  function allesResidenties(open: boolean) {
    setOpenVme(Object.fromEntries(groups.map((g) => [g.key, open])));
  }

  function ververst() {
    qc.invalidateQueries({ queryKey: ["syndici"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  const withSyndicus = groups.reduce((n, g) => n + g.rows.length, 0);
  const zonderVme = groups.filter((g) => g.rows.length === 0).length;
  const zonderFiche = groups.filter((g) => !g.dir).length;

  async function verwijder(id: string, label: string) {
    setBusy(true);
    try {
      await deleteSyndicus({ data: { id } });
      toast.success(`Contactfiche van ${label} verwijderd`);
      ververst();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen lukte niet.");
    } finally {
      setBusy(false);
      setConfirmKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-3xl font-black uppercase">Syndici</h1>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(open === "nieuw" ? null : "nieuw")}>
          {open === "nieuw" ? "Sluiten" : "Nieuwe syndicus"}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/klanten">Naar klanten</Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {groups.length} syndicus{groups.length === 1 ? "" : "i"} met samen {withSyndicus} residentie
        {withSyndicus === 1 ? "" : "s"}.
        {zonderVme > 0 && <> {zonderVme} {zonderVme === 1 ? "fiche heeft" : "fiches hebben"} nog geen residentie.</>}
        {data.length - withSyndicus > 0 && (
          <>
            {" "}
            Nog {(data.length - withSyndicus).toLocaleString("nl-BE")} klant{data.length - withSyndicus === 1 ? "" : "en"} zonder
            syndicus; vink die in bij <Link to="/klanten" className="underline">Klanten</Link> en klik{" "}
            <strong className="font-semibold text-foreground">Syndicus toewijzen</strong>.
          </>
        )}
      </p>

      <ResidentiesOverzicht rijen={rijen} />

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <h2 className="text-sm font-black uppercase tracking-wide">Per syndicus</h2>
        <span className="text-xs text-muted-foreground">klik op het aantal residenties om de lijst te openen</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => allesResidenties(true)}>
            Alles uitklappen
          </Button>
          <Button size="sm" variant="outline" onClick={() => allesResidenties(false)}>
            Alles inklappen
          </Button>
        </div>
      </div>

      {open === "nieuw" && (
        <Fiche
          title="Nieuwe syndicus"
          saveLabel="Bewaren"
          initial={LEEG}
          onSaved={() => {
            setOpen(null);
            ververst();
          }}
          onCancel={() => setOpen(null)}
        />
      )}

      {groups.length === 0 && (
        <div className="rounded-md border bg-card p-6 text-muted-foreground">
          Nog geen syndici bekend. Klik <strong className="font-semibold text-foreground">Nieuwe syndicus</strong> om er een aan
          te maken, of wijs er een toe bij een klant.
        </div>
      )}

      {groups.map((g) => {
        const bron: SyndicusDirInput = g.dir ?? ausDerKlant(g.rows as unknown as Record<string, unknown>[]);
        const details: [string, string | null][] = [
          ["Contactpersoon", (bron.contact as string | null) ?? null],
          ["Btw-nummer", (bron.vat_number as string | null) ?? null],
          [
            "Adres",
            bron.street || bron.city
              ? formatAddress({
                  street: bron.street ?? null,
                  house_number: bron.house_number ?? null,
                  postal_code: bron.postal_code ?? null,
                  city: bron.city ?? null,
                })
              : null,
          ],
          ["Telefoon", (bron.phone as string | null) ?? null],
          ["E-mail", (bron.email as string | null) ?? null],
          ["E-mail boekhouding", (bron.billing_email as string | null) ?? null],
        ];
        const bewerken = open === g.key;
        const openResidenties = !!openVme[g.key];
        return (
          <section
            key={g.key}
            id={`syndicus-${encodeURIComponent(g.key)}`}
            className="scroll-mt-20 rounded-md border bg-card p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-xl font-black uppercase">{g.label}</h2>
              {g.rows.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleResidenties(g.key)}
                  aria-expanded={openResidenties}
                  className="flex items-center gap-1 rounded bg-primary/15 px-2 py-0.5 text-xs font-bold hover:bg-primary/25"
                >
                  {openResidenties ? (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  )}
                  {g.rows.length} residentie{g.rows.length === 1 ? "" : "s"}
                </button>
              ) : (
                <span className="rounded border px-2 py-0.5 text-xs">nog geen residentie</span>
              )}
              {!g.dir && <span className="rounded border px-2 py-0.5 text-xs">nog geen fiche</span>}
              <div className="ml-auto flex flex-wrap gap-2">
                {g.dir ? (
                  <Button size="sm" variant="outline" onClick={() => setOpen(bewerken ? null : g.key)}>
                    {bewerken ? "Sluiten" : "Bewerken"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setOpen(bewerken ? null : g.key)}>
                    {bewerken ? "Sluiten" : "Contactfiche aanmaken"}
                  </Button>
                )}
                {g.dir &&
                  (confirmKey === g.key ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-bold">Zeker weten?</span>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmKey(null)}>
                        Nee
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => verwijder(g.dir!.id, g.label)}>
                        Ja, verwijderen
                      </Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmKey(g.key)}>
                      Verwijderen
                    </Button>
                  ))}
                <Button asChild size="sm" variant="outline">
                  <Link to="/klanten" search={{ q: g.label }}>
                    Naar klanten
                  </Link>
                </Button>
              </div>
            </div>

            {bewerken && (
              <div className="mt-3">
                <Fiche
                  id={g.dir?.id ?? null}
                  title={g.dir ? `${g.label} bewerken` : `Contactfiche voor ${g.label}`}
                  saveLabel={g.dir ? "Bewaren" : "Fiche aanmaken"}
                  initial={bron}
                  onSaved={() => {
                    setOpen(null);
                    ververst();
                  }}
                  onCancel={() => setOpen(null)}
                />
              </div>
            )}

            <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="min-w-36 text-xs font-bold uppercase text-muted-foreground">{label}</dt>
                  <dd className={`[overflow-wrap:anywhere] ${value ? "font-semibold" : "text-muted-foreground"}`}>
                    {value || "nog niet ingevuld"}
                  </dd>
                </div>
              ))}
            </dl>

            {g.rows.length === 0 ? (
              <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
                Nog geen residentie toegewezen. Vink bij <Link to="/klanten" className="underline">Klanten</Link> de bijbehorende
                residenties in en klik <strong className="font-semibold text-foreground">Syndicus toewijzen</strong>; deze fiches
                staan daar al in de keuzelijst.
              </p>
            ) : !openResidenties ? (
              <button
                type="button"
                onClick={() => toggleResidenties(g.key)}
                className="mt-3 flex w-full items-center gap-2 border-t pt-3 text-left text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                Lijst van {g.rows.length} residentie{g.rows.length === 1 ? "" : "s"} openen
              </button>
            ) : (
              <div className="mt-3 max-h-96 overflow-auto rounded-md border bg-muted/20">
                <table className="w-full text-sm [&_tbody_tr]:border-t [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-baseline">
                  <thead className="sticky top-0 z-10 bg-card text-left text-xs font-bold uppercase tracking-wide text-muted-foreground [&_th]:px-3 [&_th]:py-1.5">
                    <tr>
                      <th className="w-24">Klantnr.</th>
                      <th>Residentie</th>
                      <th className="hidden sm:table-cell">Adres</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((c) => (
                      <tr key={c.id}>
                        <td className="font-mono text-xs text-muted-foreground">
                          {(c as { customer_number?: string | null }).customer_number ?? "—"}
                        </td>
                        <td className="font-bold">
                          {c.name}
                          <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                            {formatAddress(c) || "geen adres"}
                          </span>
                        </td>
                        <td className="hidden text-muted-foreground sm:table-cell">{formatAddress(c) || "geen adres"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
