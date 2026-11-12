import { parseContacts, upsertContact } from "@/lib/customer-contacts";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteAddressFields } from "@/components/SiteAddressFields";
import { formatAddress } from "@/lib/address";
import { VAT_RATES } from "@/lib/billing";
import { vatRateForCustomer } from "@/lib/vat-number";
import { allCustomers, customerKey } from "@/lib/customers";
import { CustomerPicker } from "@/components/CustomerPicker";

const emptyForm = { name: "", street: "", house_number: "", postal_code: "", city: "", phone: "", email: "", billing_email: "", vat_number: "", project_name: "", description: "", technician_id: "", activity_id: "", vat_rate: "21", scheduled_date: "", use_site_address: false, site_street: "", site_house_number: "", site_postal_code: "", site_city: "", site_contact_name: "", site_contact_phone: "" };

export function TaskCreateDialog({ open, day, direct = false, onClose }: { open: boolean; day?: string | undefined; direct?: boolean | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ ...emptyForm, scheduled_date: day ?? (direct ? new Date().toLocaleDateString("sv-SE") : "") });
  const [saving, setSaving] = useState(false);
  const setOpen = (value: boolean) => { if (!value) onClose(); };
  const { data: opts } = useQuery({
    queryKey: ["assign_opts"],
    
    queryFn: async () => {
      const [t, a] = await Promise.all([
        supabase.from("technicians").select("id, name").order("name"),
        supabase.from("activities").select("id, name, hourly_rate").order("name"),
      ]);
      return { techs: t.data ?? [], acts: a.data ?? [] };
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    
    queryFn: () => allCustomers(supabase),
  });
  const {data:projects=[]}=useQuery({queryKey:['customer_projects'],queryFn:async()=>{const {data,error}=await supabase.from('customer_projects').select('*').order('name');if(error)throw error;return data??[];}});
  const selectedCustomer = customers.find(c=>customerKey(c)===customerKey(form));
  const selectedProjects = projects.filter(p=>p.customer_id===selectedCustomer?.id);
  const customerLabel = (c: (typeof customers)[number]) => [c.customer_number,c.name, [c.street, c.house_number].filter(Boolean).join(" "), c.city].filter(Boolean).join(" — ");
  function pickCustomer(label: string) {
    const c = customers.find((x) => customerLabel(x) === label);
    if (!c) return;
    setForm((f) => ({ ...f, name: c.name, street: c.street ?? "", house_number: c.house_number ?? "", postal_code: c.postal_code ?? "", city: c.city ?? "", phone: c.phone ?? "", email: c.email ?? "", billing_email: c.billing_email ?? "", vat_number: c.vat_number ?? "", project_name: c.project_name ?? "", vat_rate: String(vatRateForCustomer(c.vat_number ?? "", Number(f.vat_rate), undefined, { postalCode: c.postal_code, vrijBeroep: !!c.vrij_beroep, defaultRate: c.default_vat_rate })) }));
  }
  async function addToe(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: created, error } = await supabase
      .from("work_orders")
      .insert({
        customer_name: form.name,
        street: form.street || null,
        house_number: form.house_number || null,
        postal_code: form.postal_code || null,
        city: form.city || null,
        address: formatAddress(form),
        use_site_address: form.use_site_address,
        site_street: form.site_street || null,
        site_house_number: form.site_house_number || null,
        site_postal_code: form.site_postal_code || null,
        site_city: form.site_city || null,
        site_contact_name: form.site_contact_name || null,
        site_contact_phone: form.site_contact_phone || null,
        phone: form.phone || null,
        email: form.email || null,
        billing_email: form.billing_email || null,
        vat_number: form.vat_number.trim() || null,
        project_name: form.project_name.trim() || null,
        description: form.description || null,
        technician_id: form.technician_id || null,
        status: form.technician_id ? "toegewezen" : "nieuw",
        activity_id: form.activity_id || null,
        vat_rate: Number(form.vat_rate),
        scheduled_date: form.scheduled_date || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !created) {
      toast.error(error?.message ?? "Aanmaken mislukt");
      return;
    }
    qc.invalidateQueries({ queryKey: ["customers"] });
    // Een ingetypt project werd bij de klant bewaard: laat de projectenlijst meeverversen.
    qc.invalidateQueries({ queryKey: ["customer_projects"] });
    const wasDirect = direct;
    setForm(emptyForm);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
    if (wasDirect) {
      toast.success("Werkbon aangemaakt — vul ze verder in");
      navigate({ to: "/werkbonnen/$id", params: { id: created.id } });
      return;
    }
    toast.success("Taak aangemaakt");

  }

  return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{direct ? "Nieuwe werkbon (zonder planning)" : "Nieuwe taak inplannen"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={addToe} className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor="nb-dag">Ingepland op</Label>
                <Input id="nb-dag" type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-klant">Bestaande klant kiezen</Label>
                <CustomerPicker id="nb-klant" customers={customers} value={selectedCustomer?.id ?? ""} placeholder="Kies bestaande klant…" onChange={id => { const c = customers.find(c => c.id === id); if (c) pickCustomer(customerLabel(c)); }} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-name">Naam klant</Label>
                <Input id="nb-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-street">Straat</Label>
                  <Input id="nb-street" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-nr">Nr.</Label>
                  <Input id="nb-nr" value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-pc">Postcode</Label>
                  <Input id="nb-pc" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-city">Plaats</Label>
                  <Input id="nb-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
              </div>
              <SiteAddressFields value={form} contacts={parseContacts((selectedCustomer as { contacts?: unknown } | undefined)?.contacts)} onSaveContact={selectedCustomer ? async (c) => { const { error } = await supabase.from("customers").update({ contacts: upsertContact(parseContacts((selectedCustomer as { contacts?: unknown }).contacts), c) }).eq("id", selectedCustomer.id); if (error) toast.error(error.message); else { toast.success("Contactpersoon bewaard bij de klant"); qc.invalidateQueries({ queryKey: ["customers"] }); } } : undefined} onChange={(patch) => setForm((current) => ({ ...current, ...patch, site_street: patch.site_street ?? current.site_street, site_house_number: patch.site_house_number ?? current.site_house_number, site_postal_code: patch.site_postal_code ?? current.site_postal_code, site_city: patch.site_city ?? current.site_city, site_contact_name: patch.site_contact_name ?? current.site_contact_name, site_contact_phone: patch.site_contact_phone ?? current.site_contact_phone }))} />
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-phone">Telefoon</Label>
                  <Input id="nb-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-email">E-mail</Label>
                  <Input id="nb-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-billing">E-mail facturatie</Label>
                <Input id="nb-billing" type="email" value={form.billing_email} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-vat-number">Btw-nummer klant</Label>
                <Input id="nb-vat-number" value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value, vat_rate: String(vatRateForCustomer(e.target.value, Number(form.vat_rate), undefined, { postalCode: form.postal_code, vrijBeroep: !!selectedCustomer?.vrij_beroep, defaultRate: selectedCustomer?.default_vat_rate })) })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-project">Project</Label>
                <Input id="nb-project" list="nb-projecten" placeholder="Naam van het project…" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
                <datalist id="nb-projecten">
                  {selectedProjects.map(p=><option key={p.id} value={p.name}>{p.number} — {formatAddress(p)}</option>)}
                </datalist>
                {selectedProjects.length>0 && <select aria-label="Klantproject kiezen" className="h-10 w-full rounded-md border bg-background px-2" value="" onChange={e=>{const p=selectedProjects.find(x=>x.id===e.target.value);if(p)setForm({...form,project_name:p.name,use_site_address:!!p.street,site_street:p.street??'',site_house_number:p.house_number??'',site_postal_code:p.postal_code??'',site_city:p.city??''});}}><option value="">Project kiezen…</option>{selectedProjects.map(p=><option key={p.id} value={p.id}>{p.number} {p.name}</option>)}</select>}
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-desc">Omschrijving</Label>
                <Textarea id="nb-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-ploeg">Ploeg</Label>
                  <select id="nb-ploeg" className="h-10 w-full rounded-md border bg-background px-2" value={form.technician_id} onChange={(e) => setForm({ ...form, technician_id: e.target.value })}>
                    <option value="">— Later —</option>
                    {opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-act">Activiteit</Label>
                  <select id="nb-act" className="h-10 w-full rounded-md border bg-background px-2" value={form.activity_id} onChange={(e) => setForm({ ...form, activity_id: e.target.value })}>
                    <option value="">— Kies —</option>
                    {opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-btw">Btw</Label>
                  <select id="nb-btw" className="h-10 w-full rounded-md border bg-background px-2" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}>
                    {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Opslaan…" : direct ? "Werkbon aanmaken en invullen" : "Taak aanmaken"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
  );
}
