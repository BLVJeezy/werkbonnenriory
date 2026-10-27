import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Asks for confirmation, deletes the task (time and materials cascade) and refreshes lists. */
export async function deleteTask(qc: QueryClient, id: string, label: string) {
  if (!confirm(`${label} definitief verwijderen?`)) return false;
  const { error } = await supabase.from("work_orders").delete().eq("id", id);
  if (error) {
    toast.error(error.message);
    return false;
  }
  qc.invalidateQueries({ queryKey: ["work_orders"] });
  toast.success("Verwijderd");
  return true;
}

/** One confirmation for the explicit selection; report actual deleted rows. */
export async function deleteSelectedWorkOrders(qc: QueryClient, ids: string[]) {
  const selected = [...new Set(ids)];
  if (!selected.length || !confirm(`${selected.length} geselecteerde werkbon(nen) definitief verwijderen? Ook de bijbehorende tijdregistraties, materialen en foto's worden verwijderd. Dit kan niet ongedaan gemaakt worden.`)) return false;
  const { data, error } = await supabase.from("work_orders").delete().in("id", selected).select("id");
  if (error) {
    toast.error(error.message);
    return false;
  }
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["work_orders"] }),
    qc.invalidateQueries({ queryKey: ["facturen"] }),
  ]);
  const count = data?.length ?? 0;
  if (count) toast.success(`${count} werkbon(nen) verwijderd`);
  if (count !== selected.length) toast.error("Niet alle geselecteerde werkbonnen konden worden verwijderd. De lijst is vernieuwd.");
  return true;
}
