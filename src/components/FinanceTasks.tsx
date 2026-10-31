import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function FinanceTasks({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: tasks = [], error } = useQuery({ queryKey: ["fin", "tasks", companyId], refetchInterval: 30_000, queryFn: async () => {
    const { data, error } = await supabase.from("fin_tasks").select("*").eq("finance_company_id", companyId).in("status", ["taak", "opvolgen"]).order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  } });
  if (error) return <p className="text-sm text-destructive">Financiële opvolgtaken konden niet geladen worden.</p>;
  if (!tasks.length) return null;
  return <section className="space-y-2 border-t border-border pt-4"><h2 className="font-bold">Financiële opvolging ({tasks.length})</h2>{tasks.map(task => <div key={task.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-border py-2"><div className="min-w-0 flex-1"><p className="font-semibold">{task.title}</p><p className="whitespace-pre-line break-words text-xs text-muted-foreground">{task.body_text}</p>{task.due_date && <p className="text-xs">{task.due_date}</p>}</div><div className="flex gap-1">{task.finance_event_key.startsWith("inv-review:") && <Link to="/finance" search={{ tab: "facturen", id: task.finance_event_key.slice(11), maand: undefined }}><Button size="sm" variant="outline">Bekijken</Button></Link>}<Button size="sm" variant="outline" onClick={async () => { const { error } = await supabase.from("fin_tasks").update({ status: "afgerond" }).eq("id", task.id); if (error) return void toast.error("Afsluiten mislukt"); await qc.invalidateQueries({ queryKey: ["fin", "tasks"] }); }}>Afsluiten</Button></div></div>)}</section>;
}