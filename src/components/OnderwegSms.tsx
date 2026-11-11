import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getOnderwegSms, sendOnderwegSms } from "@/lib/sms.functions";
import { normalizeMobile } from "@/lib/sms-phone";

/** "We zijn onderweg" SMS: edit number and text, confirm, send exactly once per confirmation.
 *  compact = small button for task cards, so the crew can send before opening the task. */
export function OnderwegSms({ workOrderId, compact = false }: { workOrderId: string; compact?: boolean }) {
  const load = useServerFn(getOnderwegSms);
  const send = useServerFn(sendOnderwegSms);
  const [open, setOpen] = useState(false);
  // Only ask the server once the button is clicked: a calendar with dozens of tasks must not fire dozens of calls.
  const q = useQuery({ queryKey: ["onderweg_sms", workOrderId], queryFn: () => load({ data: { workOrderId } }), enabled: open });
  const [confirm, setConfirm] = useState(false);
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef<string>("");
  const d = q.data;
  useEffect(() => { if (open && d && !body) { setPhone(d.phone); setBody(d.template); } }, [open, d]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    setConfirm(false);
    key.current = crypto.randomUUID();
    setOpen(true);
    if (d) { setPhone(d.phone); setBody(d.template); }
  };
  const norm = d?.canEditNumber ? normalizeMobile(phone) : null;
  const numberOk = d?.canEditNumber ? !!norm?.ok : !!d?.phoneValid;

  async function doSend() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await send({ data: { workOrderId, requestKey: key.current, phone: d?.canEditNumber && norm?.ok ? norm.e164 : undefined, body } });
      if (r.ok) { toast.success("SMS verzonden"); setOpen(false); }
      else toast.error(r.error);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); setConfirm(false); key.current = crypto.randomUUID(); q.refetch(); }
  }

  return (
    <section className={compact ? "min-w-0" : "no-print rounded-md border-2 border-primary bg-card p-3"}>
      {compact ? (
        <Button size="sm" variant="outline" className="h-8 w-full justify-start border-primary text-xs font-black uppercase" onClick={start}>📱 SMS – wij zijn onderweg</Button>
      ) : (
        <Button size="lg" className="h-14 w-full text-base font-black uppercase" onClick={start}>📱 SMS – wij zijn onderweg</Button>
      )}
      {open && q.isLoading && <p className="mt-2 text-sm text-muted-foreground">Gegevens laden…</p>}
      {open && q.isError && <p className="mt-2 text-sm text-destructive">Kon de SMS-gegevens niet laden: {(q.error as Error).message}</p>}
      {d && !d.config.configured && (
        <p className="mt-2 text-sm text-destructive">SMS is nog niet ingesteld ({d.config.missing.join(", ")}). Er wordt niets verzonden tot dit ingesteld is.</p>
      )}
      {open && d && (
        <div className="mt-3 space-y-3">
          {d.name && <p className="text-sm">Klant: <b>{d.name}</b>{d.address && <> — {d.address}</>}</p>}
          <div>
            <label className="text-sm font-semibold">Gsm-nummer</label>
            {d.canEditNumber ? (
              <>
                <Input value={phone} onChange={(e) => { setPhone(e.target.value); setConfirm(false); }} inputMode="tel" placeholder="0470 12 34 56" />
                <p className={`text-xs ${norm?.ok ? "text-muted-foreground" : "text-destructive"}`}>{norm?.ok ? `Wordt verzonden naar ${norm.e164}` : norm?.error}</p>
              </>
            ) : (
              <p className="font-mono">{d.phone || "Geen geldig gsm-nummer bij deze werkbon"}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-semibold">Bericht</label>
            <Textarea value={body} onChange={(e) => { setBody(e.target.value); setConfirm(false); }} rows={3} maxLength={480} />
            <p className="text-xs text-muted-foreground">{body.length} tekens</p>
          </div>
          {!confirm ? (
            <div className="flex flex-wrap gap-2">
              <Button disabled={!numberOk || !body.trim() || !d.config.configured} onClick={() => setConfirm(true)}>Verder</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
            </div>
          ) : (
            <div className="space-y-2 rounded-md border border-primary p-3">
              <p className="text-sm font-semibold">SMS nu echt versturen naar {d.canEditNumber ? norm?.ok && norm.e164 : d.phone}?</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={doSend}>{busy ? "Bezig…" : "Ja, verstuur"}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>Nee</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {d && d.history.length > 0 && (
        <ul className="mt-3 divide-y text-sm">
          {d.history.map((h: any) => (
            <li key={h.id} className="py-1">
              <span className="font-mono">{new Date(h.created_at).toLocaleString("nl-BE")}</span> · {h.to_number} ·{" "}
              <b className={h.status === "mislukt" ? "text-destructive" : ""}>{h.status}</b>
              {h.provider_message_id && <span className="text-xs text-muted-foreground"> · {h.provider_message_id}</span>}
              {h.error && <div className="text-xs text-destructive">{h.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
