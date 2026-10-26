import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function mapsUrl(address: string) {
  // No origin = Google Maps starts from the phone's current location.
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address)}`;
}

type Props = {
  id: string;
  address: string | null;
  phone: string | null;
  runningEntryId: string | null;
  showTimer?: boolean;
};

/** Start/stop timer, route and call buttons. Stopping opens the task page. */
export function TaskActions({ id, address, phone, runningEntryId, showTimer = true }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

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
      {address && (
        <Button size="sm" variant="outline" asChild>
          <a href={mapsUrl(address)} target="_blank" rel="noreferrer">
            Route
          </a>
        </Button>
      )}
      {phone && (
        <Button size="sm" variant="outline" asChild>
          <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>Bel klant</a>
        </Button>
      )}
    </div>
  );
}
