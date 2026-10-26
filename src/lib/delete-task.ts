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
