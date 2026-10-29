import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { allCustomers } from "@/lib/customers";
import { reassignCustomerPatch } from "@/lib/reassign-customer";
import { Button } from "@/components/ui/button";
import { CustomerPicker } from "@/components/CustomerPicker";
import { Label } from "@/components/ui/label";

type Props = { wo: Parameters<typeof reassignCustomerPatch>[0] & { id: string }; onDone: () => void };

export function ReassignCustomer({ wo, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], enabled: open, queryFn: () => allCustomers(supabase) });
  const lab = (c: any) => [c.customer_number, c.name, [c.street, c.house_number].filter(Boolean).join(" "), c.city].filter(Boolean).join(" — ");
  const chosen = customers.find((c: any) => lab(c) === label);

  async function save() {
    if (!chosen) return;
    const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("work_order_id", wo.id);
    const warn = count ? "\n\nLet op: er bestaat al een factuur. Die blijft op de oude klant; maak zo nodig een creditnota en een nieuwe factuur." : "";
    if (!confirm(`Werkbon toewijzen aan ${chosen.name}? Het huidige adres blijft als werfadres staan.${warn}`)) return;
    const { error } = await supabase.from("work_orders").update(reassignCustomerPatch(wo, chosen)).eq("id", wo.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Werkbon staat nu op ${chosen.name}`);
    setOpen(false); setLabel(""); onDone();
  }

  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Andere klant (facturatie)</Button>;
  return (
    <div className="w-full space-y-2 rounded-md border bg-card p-3">
      <Label>Nieuwe factuurklant</Label>
      <CustomerPicker customers={customers} value={chosen?.id ?? ""} placeholder="Kies factuurklant…" onChange={id => { const c = customers.find(c => c.id === id); if (c) setLabel(lab(c)); }} />
      <div className="flex gap-2">
        <Button disabled={!chosen} onClick={save}>Toewijzen</Button>
        <Button variant="outline" onClick={() => { setOpen(false); setLabel(""); }}>Annuleren</Button>
      </div>
    </div>
  );
}
