import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GroundPlanEditorDialog, type GroundPlanRecord } from "@/components/GroundPlanEditorDialog";
import { Map as MapIcon, Pencil, Trash2 } from "lucide-react";

const BUCKET = "werkbon-fotos";

async function attachSignedUrls(rows: GroundPlanRecord[]): Promise<GroundPlanRecord[]> {
  if (!rows.length) return [];
  const paths = rows.flatMap((r) => (r.background_path ? [r.rendered_path, r.background_path] : [r.rendered_path]));
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  const urlMap = new Map<string, string>();
  paths.forEach((p, i) => {
    const u = signed?.[i]?.signedUrl;
    if (u) urlMap.set(p, u);
  });
  return rows.map((r) => ({
    ...r,
    url: urlMap.get(r.rendered_path) ?? null,
    backgroundUrl: r.background_path ? (urlMap.get(r.background_path) ?? null) : null,
  }));
}

export function WorkOrderGroundPlans({
  workOrderId,
  customerId,
  projectId,
  locked,
}: {
  workOrderId: string;
  customerId: string | null;
  projectId: string | null;
  locked: boolean;
}) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<GroundPlanRecord | null>(null);

  const { data: plans = [] } = useQuery({
    queryKey: ["ground_plans", "work_order", workOrderId, customerId],
    queryFn: async () => {
      const q = supabase.from("customer_ground_plans").select("*").order("created_at", { ascending: false });
      const { data, error } = customerId
        ? await q.or(`work_order_id.eq.${workOrderId},customer_id.eq.${customerId}`)
        : await q.eq("work_order_id", workOrderId);
      if (error) throw error;
      return attachSignedUrls((data ?? []) as GroundPlanRecord[]);
    },
  });

  const currentPlans = plans.filter((p) => p.work_order_id === workOrderId);
  const earlierPlans = plans.filter((p) => p.work_order_id !== workOrderId);

  async function togglePdf(plan: GroundPlanRecord, next: boolean) {
    const { error } = await supabase.from("customer_ground_plans").update({ include_in_pdf: next }).eq("id", plan.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["ground_plans"] });
  }

  async function remove(plan: GroundPlanRecord) {
    if (!confirm(`Grondplan "${plan.title}" verwijderen?`)) return;
    const toDelete = plan.background_path ? [plan.rendered_path, plan.background_path] : [plan.rendered_path];
    await supabase.storage.from(BUCKET).remove(toDelete);
    const { error } = await supabase.from("customer_ground_plans").delete().eq("id", plan.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ground_plans"] });
  }

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black uppercase">Rioolstelsel / Grondplan</h2>
        {!locked && customerId && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <MapIcon className="h-4 w-4" />
            Rioolstelsel intekenen
          </Button>
        )}
      </div>

      {!customerId && (
        <p className="text-sm text-muted-foreground">Koppel eerst een klant aan deze werkbon om een grondplan op te slaan.</p>
      )}

      {customerId && currentPlans.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nog geen rioolstelsel ingetekend op deze werkbon.
          {earlierPlans.length > 0 && ` Er ${earlierPlans.length === 1 ? "is 1 eerder plan" : `zijn ${earlierPlans.length} eerdere plannen`} bij deze klant beschikbaar om te hergebruiken.`}
        </p>
      )}

      {currentPlans.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {currentPlans.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border p-2.5">
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt={p.title} className="max-h-56 w-full rounded border bg-white object-contain" />
                </a>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("nl-BE")}</div>
                </div>
                {!locked && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { setEditing(p); setEditorOpen(true); }} title="Bewerken">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => remove(p)} title="Verwijderen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={p.include_in_pdf} disabled={locked} onCheckedChange={(v) => togglePdf(p, v === true)} />
                Opnemen in werkbon-PDF
              </label>
            </div>
          ))}
        </div>
      )}

      {customerId && (
        <GroundPlanEditorDialog
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          customerId={customerId}
          projectId={projectId}
          workOrderId={workOrderId}
          existingPlan={editing}
          reusablePlans={plans}
          onSaved={() => qc.invalidateQueries({ queryKey: ["ground_plans"] })}
        />
      )}
    </section>
  );
}