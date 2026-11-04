import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type OpenInfo = { last: string; count: number };

/** Mailopeningen per document-ID (factuur, creditnota, offerte, werkbon, herinnering). */
export function useOpens(types: string[]) {
  return useQuery({
    queryKey: ["document-opens", types.join(",")],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase.from("document_deliveries").select("document_id, document_type, sent_at, document_open_events(opened_at)").in("document_type", types).not("sent_at", "is", null).order("created_at", { ascending: false }).limit(2000);
      const opens: Record<string, OpenInfo & { reminderOpened?: boolean }> = {};
      const sent = new Set<string>();
      for (const d of (data ?? []) as { document_id: string; document_type: string; document_open_events: { opened_at: string }[] }[]) {
        sent.add(d.document_id);
        for (const e of d.document_open_events ?? []) {
          const cur = opens[d.document_id] ?? { last: e.opened_at, count: 0 };
          cur.count++; if (e.opened_at > cur.last) cur.last = e.opened_at;
          if (d.document_type === "herinnering") cur.reminderOpened = true;
          opens[d.document_id] = cur;
        }
      }
      return { opens, sent };
    },
  });
}

export function OpenEye({ info, sent = true }: { info?: OpenInfo | undefined; sent?: boolean }) {
  if (!sent) return null;
  const label = info ? `Geopend ${new Date(info.last).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short" })}${info.count > 1 ? ` · ${info.count}×` : ""}` : "Nog niet geopend";
  return (
    <span title={label} aria-label={label} className={`inline-flex items-center gap-1 text-xs font-semibold ${info ? "text-success" : "text-foreground"}`}>
      {info ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      {info && info.count > 1 && <span>{info.count}</span>}
    </span>
  );
}
