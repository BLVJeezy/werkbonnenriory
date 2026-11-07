import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SiteAddressParts } from "@/lib/address";
import { hasContact, type CustomerContact } from "@/lib/customer-contacts";

export function SiteAddressFields({ value, disabled = false, onChange, saveOnBlur = false, contacts, onSaveContact }: {
  value: SiteAddressParts;
  disabled?: boolean;
  onChange: (patch: SiteAddressParts) => void;
  saveOnBlur?: boolean;
  /** Bewaarde contactpersonen van de klant (bv. VME-gebouw). */
  contacts?: CustomerContact[] | undefined;
  /** Ingevulde contactpersoon bewaren bij de klant voor de volgende keer. */
  onSaveContact?: ((c: CustomerContact) => void) | undefined;
}) {
  const address = [
    ["site_street", "Straat werf"], ["site_house_number", "Nr. werf"],
    ["site_postal_code", "Postcode werf"], ["site_city", "Plaats werf"],
  ] as const;
  const contact = [["site_contact_name", "Contactpersoon"], ["site_contact_phone", "Telefoon contactpersoon"]] as const;
  const input = (key: (typeof address)[number][0] | (typeof contact)[number][0], label: string) => <div key={key} className="space-y-1">
    <Label htmlFor={key}>{label}</Label>
    {saveOnBlur ? <Input id={key} key={`${key}:${value[key]}`} defaultValue={value[key] ?? ""} disabled={disabled} onBlur={(e) => { if (e.target.value !== (value[key] ?? "")) onChange({ [key]: e.target.value }); }} /> :
      <Input id={key} value={value[key] ?? ""} disabled={disabled} onChange={(e) => onChange({ [key]: e.target.value })} />}
  </div>;
  const list = contacts ?? [];
  const name = value.site_contact_name?.trim() ?? "", phone = value.site_contact_phone?.trim() ?? "";
  const canSave = !!onSaveContact && !disabled && (name || phone) && !hasContact(list, name, phone);
  return <div className="space-y-3 sm:col-span-2">
    <Label className="flex items-center gap-2">
      <Checkbox checked={value.use_site_address ?? false} disabled={disabled} onCheckedChange={(checked) => onChange({ use_site_address: checked === true })} />
      Apart werfadres
    </Label>
    {value.use_site_address && <div className="grid grid-cols-2 gap-3">{address.map(([k, l]) => input(k, l))}</div>}
    {list.length > 0 && <div className="space-y-1">
      <Label htmlFor="contact-kiezen">Bewaarde contactpersoon kiezen</Label>
      <select id="contact-kiezen" disabled={disabled} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value=""
        onChange={(e) => { const c = list[Number(e.target.value)]; if (c) onChange({ site_contact_name: c.name, site_contact_phone: c.phone }); }}>
        <option value="">— kies wie gebeld moet worden —</option>
        {list.map((c, i) => <option key={i} value={i}>{[c.name, c.role && `(${c.role})`, c.phone].filter(Boolean).join(" ")}</option>)}
      </select>
    </div>}
    <div className="grid grid-cols-2 gap-3">{contact.map(([k, l]) => input(k, l))}</div>
    {canSave && <Button type="button" size="sm" variant="outline" onClick={() => onSaveContact!({ name, phone })}>Contactpersoon bewaren bij klant</Button>}
  </div>;
}
