import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";
import { SignaturePad } from "@/components/SignaturePad";
import { formatDuration, totalSeconds } from "@/lib/time";
import { formatAddress } from "@/lib/address";
import { useRole } from "@/lib/use-role";

export const Route = createFileRoute("/_authenticated/werkbonnen/$id")({
  head: () => ({ meta: [{ title: "Werkbon — Riory" }] }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const key = ["work_order", id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [w, t, m, techs, prods] = await Promise.all([
        supabase.from("work_orders").select("*").eq("id", id).single(),
        supabase.from("time_entries").select("*").eq("work_order_id", id).order("started_at"),
        supabase.from("materials").select("*").eq("work_order_id", id).order("created_at"),
        supabase.from("technicians").select("*").order("name"),
        supabase.from("products").select("*").order("name"),
      ]);
      return { wo: w.data, times: t.data ?? [], mats: m.data ?? [], techs: techs.data ?? [], prods: prods.data ?? [] };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const role = useRole();
  const [mat, setMat] = useState({ productId: "", quantity: "1" });
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");

  if (!data?.wo) return <p className="text-muted-foreground">Laden…</p>;
  const { wo, times, mats, techs, prods } = data;
  const locked = wo.status === "afgetekend";
  const isAdmin = role === "admin";
  const infoLocked = locked || !isAdmin;
  const kind = locked ? "Werkbon" : "Taak";
  const saveAddr = (patch: Partial<Record<"street" | "house_number" | "postal_code" | "city", string>>) =>
    update({ ...patch, address: formatAddress({ ...wo, ...patch }) });
  const running = times.find((t) => !t.ended_at);
  const total = totalSeconds(times, now);

  async function update(patch: Database["public"]["Tables"]["work_orders"]["Update"]) {
    const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }

  async function toggleTimer() {
    if (running) {
      await supabase.from("time_entries").update({ ended_at: new Date().toISOString() }).eq("id", running.id);
    } else {
      await supabase.from("time_entries").insert({ work_order_id: id });
    }
    refresh();
  }

  return (
    <div className="space-y-6">
      <Link to="/werkbonnen" className="text-sm text-muted-foreground underline">
        {isAdmin ? "← Alle werkbonnen" : "← Mijn taken"}
      </Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-black uppercase">{kind} #{wo.number}</h1>
        <span className="rounded bg-accent px-2 py-0.5 text-sm font-bold capitalize text-accent-foreground">{wo.status}</span>
      </div>

      <section className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2">
        <Field label="Klant" value={wo.customer_name} disabled={infoLocked} onSave={(v) => update({ customer_name: v })} />
        <div />
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Straat" value={wo.street ?? (wo.house_number || wo.city ? "" : wo.address ?? "")} disabled={infoLocked} onSave={(v) => saveAddr({ street: v })} />
          <Field label="Nr." value={wo.house_number ?? ""} disabled={infoLocked} onSave={(v) => saveAddr({ house_number: v })} />
        </div>
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Postcode" value={wo.postal_code ?? ""} disabled={infoLocked} onSave={(v) => saveAddr({ postal_code: v })} />
          <Field label="Plaats" value={wo.city ?? ""} disabled={infoLocked} onSave={(v) => saveAddr({ city: v })} />
        </div>
        <Field label="Telefoon" value={wo.phone ?? ""} disabled={infoLocked} onSave={(v) => update({ phone: v })} />
        <Field label="E-mail" value={wo.email ?? ""} disabled={infoLocked} onSave={(v) => update({ email: v })} />
        <div className="space-y-1 sm:col-span-2">
          <Label>Omschrijving</Label>
          <Textarea
            defaultValue={wo.description ?? ""}
            disabled={infoLocked}
            onBlur={(e) => e.target.value !== (wo.description ?? "") && update({ description: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Technieker</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2"
            value={wo.technician_id ?? ""}
            disabled={infoLocked}
            onChange={(e) =>
              update({ technician_id: e.target.value || null, status: e.target.value ? "toegewezen" : "nieuw" })
            }
          >
            <option value="">— Niet toegewezen —</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {wo.source_subject && (
          <div className="text-sm text-muted-foreground sm:self-end">Mail: “{wo.source_subject}”</div>
        )}
      </section>

      <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 text-lg font-black uppercase">Tijd</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="font-mono text-4xl font-semibold tabular-nums">{formatDuration(total)}</div>
          {!locked && (
            <Button size="lg" variant={running ? "destructive" : "default"} onClick={toggleTimer} className="min-w-32 text-lg">
              {running ? "■ Stop" : "▶ Start"}
            </Button>
          )}
        </div>
        {times.length > 0 && (
          <ul className="mt-3 space-y-1 font-mono text-sm text-muted-foreground">
            {times.map((t) => (
              <li key={t.id}>
                {new Date(t.started_at).toLocaleString("nl-BE")} →{" "}
                {t.ended_at ? new Date(t.ended_at).toLocaleTimeString("nl-BE") : "bezig"} (
                {formatDuration(totalSeconds([t], now))})
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 text-lg font-black uppercase">Materialen</h2>
        <ul className="mb-3 divide-y">
          {mats.length === 0 && <li className="py-2 text-muted-foreground">Nog geen materialen.</li>}
          {mats.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="w-20 font-mono">
                {m.quantity} {m.unit}
              </span>
              <span className="flex-1">{m.name}</span>
              {!locked && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await supabase.from("materials").delete().eq("id", m.id);
                    refresh();
                  }}
                >
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!locked && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const p = prods.find((x) => x.id === mat.productId);
              if (!p) return;
              const { error } = await supabase
                .from("materials")
                .insert({ work_order_id: id, product_id: p.id, name: p.name, quantity: Number(mat.quantity) || 1, unit: p.unit });
              if (error) {
                toast.error(error.message);
                return;
              }
              setMat({ productId: "", quantity: "1" });
              refresh();
            }}
          >
            <Input className="w-20" type="number" step="any" min="0" value={mat.quantity} onChange={(e) => setMat({ ...mat, quantity: e.target.value })} />
            <select
              required
              className="h-9 min-w-48 flex-1 rounded-md border bg-background px-2"
              value={mat.productId}
              onChange={(e) => setMat({ ...mat, productId: e.target.value })}
            >
              <option value="">{prods.length ? "— Kies product —" : "Nog geen producten aangemaakt"}</option>
              {prods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </select>
            <Button>Toevoegen</Button>
          </form>
        )}
      </section>

      <section className="rounded-md border-2 border-primary bg-card p-4">
        <h2 className="mb-3 text-lg font-black uppercase">Aftekenen</h2>
        {locked ? (
          <div className="space-y-2">
            {wo.signature && <img src={wo.signature} alt="Handtekening klant" className="h-40 rounded border bg-background" />}
            <p>
              Afgetekend door <strong>{wo.signed_name}</strong> op {wo.signed_at && new Date(wo.signed_at).toLocaleString("nl-BE")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad onChange={setSignature} />
            <Input placeholder="Naam klant" value={signedName} onChange={(e) => setSignedName(e.target.value)} />
            <Button
              size="lg"
              disabled={!signature || !signedName || !!running}
              onClick={() =>
                update({ signature, signed_name: signedName, signed_at: new Date().toISOString(), status: "afgetekend" })
              }
            >
              Aftekenen → werkbon
            </Button>
            {running && <p className="text-sm text-muted-foreground">Stop eerst de tijd.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, disabled, onSave }: { label: string; value: string; disabled: boolean; onSave: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input defaultValue={value} disabled={disabled} onBlur={(e) => e.target.value !== value && onSave(e.target.value)} />
    </div>
  );
}
