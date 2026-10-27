import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SiteAddressParts } from "@/lib/address";

export function SiteAddressFields({ value, disabled = false, onChange, saveOnBlur = false }: {
  value: SiteAddressParts;
  disabled?: boolean;
  onChange: (patch: SiteAddressParts) => void;
  saveOnBlur?: boolean;
}) {
  const fields = [
    ["site_street", "Straat werf"], ["site_house_number", "Nr. werf"],
    ["site_postal_code", "Postcode werf"], ["site_city", "Plaats werf"],
  ] as const;
  return <div className="space-y-3 sm:col-span-2">
    <Label className="flex items-center gap-2">
      <Checkbox checked={value.use_site_address ?? false} disabled={disabled} onCheckedChange={(checked) => onChange({ use_site_address: checked === true })} />
      Apart werfadres
    </Label>
    {value.use_site_address && <div className="grid grid-cols-2 gap-3">
      {fields.map(([key, label]) => <div key={key} className="space-y-1">
        <Label htmlFor={key}>{label}</Label>
        {saveOnBlur ? <Input id={key} key={`${key}:${value[key]}`} defaultValue={value[key] ?? ""} disabled={disabled} onBlur={(e) => { if (e.target.value !== (value[key] ?? "")) onChange({ [key]: e.target.value }); }} /> :
          <Input id={key} value={value[key] ?? ""} disabled={disabled} onChange={(e) => onChange({ [key]: e.target.value })} />}
      </div>)}
    </div>}
  </div>;
}