import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function FactuurInstellingen() {
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ["factuurinstellingen"],
    queryFn: async () => (await supabase.from("settings").select("*").eq("id", 1).single()).data,
  });

  async function saveSetting(patch: Database["public"]["Tables"]["settings"]["Update"]) {
    const { error } = await supabase.from("settings").update(patch).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success("Opgeslagen");
    qc.invalidateQueries({ queryKey: ["factuurinstellingen"] });
    qc.invalidateQueries({ queryKey: ["facturen"] });
  }

  if (!s) return <p className="text-muted-foreground">Laden…</p>;
  return (
    <section className="grid gap-3 rounded-md border bg-card p-4 sm:grid-cols-2">
      <div className="space-y-1"><Label>Volgend factuurnummer</Label>
        <Input type="number" defaultValue={s.next_invoice_number} onBlur={(e) => Number(e.target.value) !== s.next_invoice_number && saveSetting({ next_invoice_number: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label>Voorvoegsel (bv. 2026-)</Label>
        <Input defaultValue={s.invoice_prefix} onBlur={(e) => e.target.value !== s.invoice_prefix && saveSetting({ invoice_prefix: e.target.value })} /></div>
      <div className="space-y-1"><Label>Betalingstermijn (dagen)</Label>
        <Input type="number" defaultValue={s.payment_days} onBlur={(e) => Number(e.target.value) !== s.payment_days && saveSetting({ payment_days: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label>Btw-nummer Riory</Label>
        <Input defaultValue={s.company_vat} onBlur={(e) => e.target.value !== s.company_vat && saveSetting({ company_vat: e.target.value })} /></div>
      <div className="space-y-1"><Label>IBAN</Label>
        <Input defaultValue={s.company_iban ?? ""} onBlur={(e) => e.target.value !== (s.company_iban ?? "") && saveSetting({ company_iban: e.target.value || null })} /></div>
      <div className="space-y-1"><Label>BIC</Label>
        <Input defaultValue={s.company_bic ?? ""} onBlur={(e) => e.target.value !== (s.company_bic ?? "") && saveSetting({ company_bic: e.target.value || null })} /></div>
      <div className="space-y-1"><Label>E-mail boekhouder (voor UBL-verzending)</Label>
        <Input type="email" defaultValue={s.accountant_email} onBlur={(e) => e.target.value !== s.accountant_email && saveSetting({ accountant_email: e.target.value })} /></div>
      <div className="flex items-start gap-2 sm:col-span-2">
        <input id="peppol-actief" type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={!!s.peppol_active} onChange={(e) => saveSetting({ peppol_active: e.target.checked })} />
        <div className="space-y-0.5">
          <Label htmlFor="peppol-actief">Peppol actief — geen OkiOki-kopie meer</Label>
          <p className="text-sm text-muted-foreground">Zet dit aan zodra je Peppol-adres echt actief is. Facturen en creditnota’s gaan dan alleen naar de klant; de UBL-kopie naar OkiOki stopt.</p>
        </div>
      </div>
      <div className="space-y-1 sm:col-span-2"><Label>Algemene voorwaarden (komen achteraan op elke factuur)</Label>
        <Textarea rows={10} defaultValue={s.terms_text ?? ""} onBlur={(e) => e.target.value !== (s.terms_text ?? "") && saveSetting({ terms_text: e.target.value || null })} /></div>
    </section>
  );
}
