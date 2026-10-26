import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/SignaturePad";
import { formatDuration, totalSeconds } from "@/lib/time";

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
      const [w, t, m, techs] = await Promise.all([
        supabase.from("work_orders").select("*").eq("id", id).single(),
        supabase.from("time_entries").select("*").eq("work_order_id", id).order("started_at"),
        supabase.from("materials").select("*").eq("work_order_id", id).order("created_at"),
        supabase.from("technicians").select("*").order("name"),
      ]);
      return { wo: w.data, times: t.data ?? [], mats: m.data ?? [], techs: techs.data ?? [] };
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

  const [mat, setMat] = useState({ name: "", quantity: "1", unit: "st" });
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");

  if (!data?.wo) return <p className="text-muted-foreground">Laden…</p>;
  const { wo, times, mats, techs } = data;
  const locked = wo.status === "afgetekend";
  const running = times.find((t) => !t.ended_at);
  const total = totalSeconds(times, now);

  async function update(patch: Record<string, unknown>) {
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
        ← Alle werkbonnen
      </Link>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-black uppercase">Werkbon #{wo.number}</h1>
        <span className="rounded bg-accent px-2 py-0.5 text-sm font-bold capitalize text-accent-foreground">{wo.status}</span>
      </div>

      <section className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2">
        <Field label="Klant" value={wo.customer_name} disabled={locked} onSave={(v) => update({ customer_name: v })} />
        <Field label="Adres" value={wo.address ?? ""} disabled={locked} onSave={(v) => update({ address: v })} />
        <Field label="Telefoon" value={wo.phone ?? ""} disabled={locked} onSave={(v) => update({ phone: v })} />
        <Field label="E-mail" value={wo.email ?? ""} disabled={locked} onSave={(v) => update({ email: v })} />
        <div className="space-y-1 sm:col-span-2">
          <Label>Omschrijving</Label>
          <Textarea
            defaultValue={wo.description ?? ""}
            disabled={locked}
            onBlur={(e) => e.target.value !== (wo.description ?? "") && update({ description: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Technieker</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2"
            value={wo.technician_id ?? ""}
            disabled={locked}
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
              const { error } = await supabase
                .from("materials")
                .insert({ work_order_id: id, name: mat.name, quantity: Number(mat.quantity) || 1, unit: mat.unit || "st" });
              if (error) return toast.error(error.message);
              setMat({ name: "", quantity: "1", unit: "st" });
              refresh();
            }}
          >
            <Input className="w-20" type="number" step="any" value={mat.quantity} onChange={(e) => setMat({ ...mat, quantity: e.target.value })} />
            <Input className="w-20" value={mat.unit} onChange={(e) => setMat({ ...mat, unit: e.target.value })} />
            <Input className="min-w-48 flex-1" placeholder="Materiaal" required value={mat.name} onChange={(e) => setMat({ ...mat, name: e.target.value })} />
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
              Werkbon aftekenen
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
