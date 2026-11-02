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
    const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("work_order_id", wo.id).not("sent_at", "is", null);
    const warn = count ? "\n\nLet op: er bestaat al een verzonden factuur. Die blijft op de oude klant; maak zo nodig een creditnota en een nieuwe factuur." : "";
    if (!confirm(`Werkbon toewijzen aan ${chosen.name}? Het huidige adres blijft als werfadres staan. Niet-verzonden facturen en conceptverslagen krijgen ook de nieuwe klant.${warn}`)) return;
    const patch = reassignCustomerPatch(wo, chosen);
    const { error } = await supabase.from("work_orders").update(patch).eq("id", wo.id);
    if (error) { toast.error(error.message); return; }
    // Overal meenemen: niet-verzonden facturen en conceptoffertes/-verslagen van deze werkbon.
    const site = [[patch.site_street ?? (wo as any).site_street, patch.site_house_number ?? (wo as any).site_house_number].filter(Boolean).join(" "), [patch.site_postal_code ?? (wo as any).site_postal_code, patch.site_city ?? (wo as any).site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
    const snap = {
      name: patch.customer_name, address: patch.address, siteAddress: site,
      vatNumber: patch.vat_number?.trim() || null, email: patch.billing_email?.trim() || patch.email?.trim() || null,
      street: patch.street, houseNumber: patch.house_number, postalCode: patch.postal_code, city: patch.city,
    };
    const [a, b] = await Promise.all([
      supabase.from("invoices").update({ customer: snap }).eq("work_order_id", wo.id).is("sent_at", null),
      supabase.from("quotes").update({ customer: snap, customer_id: patch.customer_id }).eq("source_work_order_id", wo.id).eq("status", "concept"),
    ]);
    if (a.error || b.error) toast.error(`Werkbon aangepast, maar factuur/verslag niet: ${(a.error ?? b.error)!.message}`);
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
