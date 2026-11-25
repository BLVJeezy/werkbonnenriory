import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GroundPlanEditorDialog, type GroundPlanRecord } from "@/components/GroundPlanEditorDialog";
import { Map as MapIcon, Pencil, Trash2 } from "lucide-react";

const BUCKET = "werkbon-fotos";

export function CustomerGroundPlans({
  customerId,
  projects,
}: {
  customerId: string;
  projects: Array<{ id: string; name: string; number?: string | null }>;
}) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<GroundPlanRecord | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { data: plans = [] } = useQuery({
    queryKey: ["ground_plans", "customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_ground_plans")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as GroundPlanRecord[];
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
    },
  });

  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  async function remove(plan: GroundPlanRecord) {
    if (!confirm(`Grondplan "${plan.title}" verwijderen?`)) return;
    const toDelete = plan.background_path ? [plan.rendered_path, plan.background_path] : [plan.rendered_path];
    await supabase.storage.from(BUCKET).remove(toDelete);
    const { error } = await supabase.from("customer_ground_plans").delete().eq("id", plan.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["ground_plans"] });
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold">Grondplannen &amp; rioolstelsels ({plans.length})</div>
        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 0 && (
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value || null)}
            >
              <option value="">Algemeen (klant)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <MapIcon className="h-3.5 w-3.5" />
            Nieuw grondplan
          </Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nog geen grondplannen opgeslagen voor deze klant.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="space-y-1.5 rounded border p-2">
              {p.url && (
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt={p.title} className="h-32 w-full rounded border bg-white object-contain" />
                </a>
              )}
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("nl-BE")}
                    {p.project_id && projectNames.get(p.project_id) ? ` · ${projectNames.get(p.project_id)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => { setEditing(p); setEditorOpen(true); }} title="Bewerken">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => remove(p)} title="Verwijderen">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <GroundPlanEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        customerId={customerId}
        projectId={editing ? editing.project_id : selectedProjectId}
        workOrderId={editing ? editing.work_order_id : null}
        existingPlan={editing}
        reusablePlans={plans}
        onSaved={() => qc.invalidateQueries({ queryKey: ["ground_plans"] })}
      />
    </div>
  );
}