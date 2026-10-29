import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { callTargets } from "@/lib/phone";

export function mapsUrl(address: string) {
  // No origin = Google Maps starts from the phone's current location.
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address)}`;
}

type Props = {
  id: string;
  address: string | null;
  phone: string | null;
  contactPhone?: string | null | undefined;
  contactName?: string | null | undefined;
  runningEntryId: string | null;
  showTimer?: boolean;
  /** Toon een vakje om gewerkte tijd manueel in te vullen (per ploeg instelbaar). */
  manualTime?: boolean;
  /** Tijdstip waarop de ploeg aanduidde dat de klant niet opneemt. */
  noAnswerAt?: string | null;
};

/** Het label "Neemt niet op" blijft 24 uur staan. */
export function isNoAnswer(at: string | null | undefined, now = Date.now()) {
  return !!at && now - new Date(at).getTime() < 24 * 3600_000;
}

/** Start/stop timer, route and call buttons. Stopping opens the task page. */
export function TaskActions({ id, address, phone, contactPhone, contactName, runningEntryId, showTimer = true, manualTime = false, noAnswerAt = null }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState("");
  const calls = callTargets(phone, contactPhone);

  async function saveManualTime() {
    const h = Number(hours.replace(",", "."));
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      toast.error("Vul een geldig aantal uren in, bijvoorbeeld 1,5");
      return;
    }
    setBusy(true);
    const end = new Date();
    const start = new Date(end.getTime() - Math.round(h * 3600_000));
    const { error } = await supabase.from("time_entries").insert({ work_order_id: id, started_at: start.toISOString(), ended_at: end.toISOString() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${String(h).replace(".", ",")} uur opgeslagen`);
    setHours("");
    qc.invalidateQueries({ queryKey: ["work_orders"] });
    qc.invalidateQueries({ queryKey: ["work_order", id] });
  }

  const noAnswer = isNoAnswer(noAnswerAt);
  async function toggleNoAnswer() {
    setBusy(true);
    const { error } = await supabase.from("work_orders").update({ no_answer_at: noAnswer ? null : new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(noAnswer ? "Markering verwijderd" : "Gemarkeerd: klant neemt niet op");
    qc.invalidateQueries({ queryKey: ["work_orders"] });
    qc.invalidateQueries({ queryKey: ["work_order", id] });
  }

  async function toggle() {
    setBusy(true);
    const { error } = runningEntryId
      ? await supabase.from("time_entries").update({ ended_at: new Date().toISOString() }).eq("id", runningEntryId)
      : await supabase.from("time_entries").insert({ work_order_id: id });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["work_orders"] });
    qc.invalidateQueries({ queryKey: ["work_order", id] });
    if (runningEntryId) navigate({ to: "/werkbonnen/$id", params: { id } });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {showTimer && (
        <Button size="sm" variant={runningEntryId ? "destructive" : "default"} disabled={busy} onClick={toggle}>
          {runningEntryId ? "■ Stop tijd" : "▶ Start tijd"}
        </Button>
      )}
      {manualTime && (
        <span className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Gewerkte uren"
            placeholder="uren"
            className="h-8 w-16 rounded-md border bg-background px-2 text-sm"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <Button size="sm" variant="outline" disabled={busy || !hours.trim()} onClick={saveManualTime}>
            Tijd opslaan
          </Button>
        </span>
      )}
      {address && (
        <Button size="sm" variant="outline" asChild>
          <a href={mapsUrl(address)} target="_blank" rel="noreferrer">
            Route
          </a>
        </Button>
      )}
      {calls.contact && (
        <Button size="sm" variant="outline" asChild>
          <a href={`tel:${calls.contact}`}>Bel contactpersoon{contactName ? ` (${contactName})` : ""}</a>
        </Button>
      )}
      <Button size="sm" variant={noAnswer ? "destructive" : "outline"} disabled={busy} onClick={toggleNoAnswer}>
        {noAnswer ? "Neemt niet op ✓" : "Klant neemt niet op"}
      </Button>
      {calls.customer && (
        <Button size="sm" variant="outline" asChild>
          <a href={`tel:${calls.customer}`}>Bel klant</a>
        </Button>
      )}
    </div>
  );
}
