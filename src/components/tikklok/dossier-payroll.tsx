import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPayrollProfiles } from "@/lib/tikklok/payroll.functions";
import { ProfileDialog } from "@/components/tikklok/payroll-panel";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

export function DossierPayroll({ employeeId }: { employeeId: string }) {
  const fetch = useServerFn(listPayrollProfiles);
  const q = useQuery({ queryKey: ["tikklok:payroll-profiles"], queryFn: () => fetch() });
  const [editing, setEditing] = useState(false);
  const profile = q.data?.find((p) => p.employee_id === employeeId);
  if (!profile) return <p className="text-muted-foreground">{q.isError ? "Loongegevens konden niet worden geladen." : "Laden…"}</p>;
  return <div className="space-y-4 py-4">
    <h3 className="font-semibold">Loon en vergoedingen</h3>
    <dl className="grid grid-cols-2 gap-3 text-sm"><dt>Statuut</dt><dd>{profile.status_label}</dd><dt>Uurloon</dt><dd>{profile.hourly_wage?.toLocaleString("nl-BE", { style: "currency", currency: "EUR" }) ?? "—"}</dd><dt>Maandloon</dt><dd>{profile.monthly_wage?.toLocaleString("nl-BE", { style: "currency", currency: "EUR" }) ?? "—"}</dd><dt>Overuren</dt><dd>Opgespaard · 150%</dd></dl>
    <Button onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" /> Loonparameters aanpassen</Button>
    {editing && <ProfileDialog profile={profile} onClose={() => setEditing(false)} />}
  </div>;
}