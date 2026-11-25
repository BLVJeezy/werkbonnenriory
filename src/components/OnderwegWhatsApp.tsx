import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getWorkOrderWhatsAppStatus,
  sendWorkOrderWhatsAppOnTheWay,
} from "@/lib/whatsapp-on-the-way.functions";

/**
 * One-click "We zijn onderweg" WhatsApp utility template action (feature-gated, server-only).
 * Never opens WhatsApp, never uses a deep-link fallback, and never allows free text.
 */
export function OnderwegWhatsApp({
  workOrderId,
  compact = false,
}: {
  workOrderId: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getWorkOrderWhatsAppStatus);
  const sendAction = useServerFn(sendWorkOrderWhatsAppOnTheWay);
  const [sending, setSending] = useState(false);

  const { data } = useQuery({
    queryKey: ["work-order-whatsapp-status", workOrderId],
    queryFn: () => fetchStatus({ data: { workOrderId } }),
    staleTime: 60_000,
  });

  const handleClick = async () => {
    if (!data?.canSend || sending) return;
    setSending(true);
    try {
      const res = await sendAction({ data: { workOrderId } });
      qc.invalidateQueries({ queryKey: ["work-order-whatsapp-status", workOrderId] });
      if (res.status === "accepted") toast.success(res.message);
      else toast.info(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "WhatsApp-verzending mislukt.");
    } finally {
      setSending(false);
    }
  };

  const stateLabel =
    data?.sendState === "accepted"
      ? "WhatsApp geaccepteerd (bezorging onbevestigd)"
      : data?.sendState === "uncertain"
        ? "WhatsApp-status onzeker"
        : data?.sendState === "prepared"
          ? "WhatsApp voorbereid"
          : !data?.enabled
            ? "WhatsApp – We zijn onderweg (uitgeschakeld)"
            : "WhatsApp – We zijn onderweg";

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size={compact ? "sm" : "lg"}
        variant="outline"
        disabled={!data?.canSend || sending}
        className={
          compact
            ? "h-8 w-full justify-start text-xs font-bold uppercase"
            : "h-12 w-full text-sm font-bold uppercase"
        }
        onClick={handleClick}
      >
        {sending ? "Bezig met verzenden…" : stateLabel}
      </Button>
      {data?.maskedRecipient && (
        <div className="text-[11px] text-muted-foreground">
          Ontvanger: <span className="font-mono">{data.maskedRecipient}</span>
        </div>
      )}
    </div>
  );
}