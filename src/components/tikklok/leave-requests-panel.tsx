import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X } from "lucide-react";
import { listLeaveRequests, reviewLeaveRequest, type LeaveRequestRow } from "@/lib/tikklok/admin.functions";

const TYPE_LABELS: Record<string, string> = {
  vacation: "Vakantie",
  overtime_recovery: "Recuperatie overuren",
  unpaid: "Onbetaald verlof",
};

const formatDate = (value: string) => new Date(value).toLocaleDateString("nl-BE");

export function LeaveRequestsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listLeaveRequests);
  const review = useServerFn(reviewLeaveRequest);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});

  const reqQ = useQuery({
    queryKey: ["tikklok:leaveRequests", filter],
    queryFn: () => list({ data: { status: filter } }) as Promise<LeaveRequestRow[]>,
  });

  const reviewM = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject" }) =>
      review({ data: { id: vars.id, action: vars.action, review_note: reviewNote[vars.id] ?? "" } }),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "approve" ? "Aanvraag goedgekeurd" : "Aanvraag afgewezen");
      qc.invalidateQueries({ queryKey: ["tikklok:leaveRequests"] });
      qc.invalidateQueries({ queryKey: ["tikklok:dossier"] });
      setReviewNote((n) => {
        const next = { ...n };
        delete next[vars.id];
        return next;
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Actie mislukt"),
  });

  const rows = reqQ.data ?? [];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-lg">Vakantie & recuperatie</h2>
          <p className="text-sm text-muted-foreground">
            Aanvragen van vast personeel. Bij goedkeuring komt de periode automatisch in het dossier als afwezigheid.
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">In behandeling</SelectItem>
            <SelectItem value="approved">Goedgekeurd</SelectItem>
            <SelectItem value="rejected">Afgewezen</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {reqQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen aanvragen gevonden.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-medium">{r.employee_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {TYPE_LABELS[r.request_type] ?? r.request_type} · {formatDate(r.starts_on)} t/m {formatDate(r.ends_on)}
                    {r.hours != null ? ` · ${r.hours} u` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Ingediend {formatDate(r.created_at)}</div>
                  {r.note && <div className="text-sm mt-2">"{r.note}"</div>}
                  {r.status !== "pending" && r.review_note && (
                    <div className="text-xs italic mt-2">Reactie: {r.review_note}</div>
                  )}
                </div>
                <div className="text-xs uppercase font-semibold">
                  {r.status === "pending" ? "In behandeling" : r.status === "approved" ? "Goedgekeurd" : "Afgewezen"}
                </div>
              </div>
              {r.status === "pending" && (
                <div className="mt-3 space-y-2">
                  <Input
                    placeholder="Optionele reactie voor medewerker"
                    value={reviewNote[r.id] ?? ""}
                    onChange={(e) => setReviewNote((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => reviewM.mutate({ id: r.id, action: "approve" })} disabled={reviewM.isPending}>
                      <Check className="h-4 w-4 mr-1" /> Goedkeuren
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => reviewM.mutate({ id: r.id, action: "reject" })} disabled={reviewM.isPending}>
                      <X className="h-4 w-4 mr-1" /> Afwijzen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
