import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/tikklok/signature-pad";
import { canEmployerSign, canEditContractText } from "@/lib/tikklok/contract-signature-rules";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Building2, FilePlus2, FileSignature, Printer, Save, Send, Trash2, Archive } from "lucide-react";
import { listEmployees } from "@/lib/tikklok/admin.functions";
import {
  getCompanySettings,
  saveCompanySettings,
  listContracts,
  generateContract,
  updateContractBody,
  setContractStatus,
  deleteContract,
  getContractDefaults,
  signEmployerContract,
} from "@/lib/tikklok/contracts.functions";
import {
  CONTRACT_TYPES,
  CONTRACT_BENEFITS,
  removeUnselectedContractOptions,
  contractStatusLabel,
  contractTypeLabel,
  type CompanySettings,
  type ContractRow,
} from "@/lib/tikklok/contract-types";

const dateNl = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString("nl-BE") : "—");

export function ContractsPanel() {
  return (
    <Tabs defaultValue="contracts">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="contracts">
          <FileSignature className="h-4 w-4 mr-1" /> Contracten
        </TabsTrigger>
        <TabsTrigger value="company">
          <Building2 className="h-4 w-4 mr-1" /> Firmagegevens
        </TabsTrigger>
      </TabsList>
      <TabsContent value="contracts" className="mt-6">
        <ContractList />
      </TabsContent>
      <TabsContent value="company" className="mt-6">
        <CompanyForm />
      </TabsContent>
    </Tabs>
  );
}

function printContract(row: ContractRow) {
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Sta pop-ups toe om het contract af te drukken");
    return;
  }
  const escaped = row.body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
  const escape = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
  const signatures = [
    { label: "Zaakvoerder", name: row.employer_signed_name, date: row.employer_signed_at, image: row.employer_signature_image },
    { label: "Werknemer", name: row.employee_signed_name, date: row.employee_signed_at, image: row.employee_signature_image },
  ].filter((s) => s.image && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.image)).map((s) =>
    `<section style="break-inside:avoid;margin-top:24px"><strong>${s.label}</strong><br><img alt="Handtekening ${s.label}" src="${escape(s.image ?? "")}" style="max-width:280px;height:80px;object-fit:contain"><br>${escape(s.name ?? "")} · ${escape(s.date ? new Date(s.date).toLocaleString("nl-BE") : "")}</section>`
  ).join("");
  win.document.write(
    `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${escape(contractTypeLabel(row.contract_type))} – ${escape(row.employee_name ?? "")}</title><style>@page{margin:2.2cm}body{font-family:Calibri,"Helvetica Neue",Arial,sans-serif;max-width:17cm;margin:0 auto;line-height:1.35;white-space:pre-wrap;font-size:11pt;text-align:justify}h1{font-size:11pt;text-align:center;font-weight:bold;margin:0 0 1.2em}</style></head><body><h1>${contractTypeLabel(row.contract_type)}</h1>${escaped.split("\n").slice(1).join("\n").replace(/^\s+/, "")}${signatures}</body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}

function ContractList() {
  const qc = useQueryClient();
  const contractsQ = useQuery({ queryKey: ["tikklok:contracts"], queryFn: () => listContracts() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [bodyDraft, setBodyDraft] = useState("");
  const [signing, setSigning] = useState<ContractRow | null>(null);
  const [signName, setSignName] = useState("");
  const [signImage, setSignImage] = useState<string | null>(null);
  const companyQ = useQuery({ queryKey: ["tikklok:company-settings"], queryFn: () => getCompanySettings() });
  const doSign = useServerFn(signEmployerContract);
  const signM = useMutation({
    mutationFn: () => {
      if (!signing || !signImage) throw new Error("Teken eerst je handtekening");
      return doSign({ data: { id: signing.id, fullName: signName, signatureImage: signImage } });
    },
    onSuccess: () => {
      setSigning(null);
      setSignImage(null);
      toast.success("Handtekening zaakvoerder opgeslagen");
      qc.invalidateQueries({ queryKey: ["tikklok:contracts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doStatus = useServerFn(setContractStatus);
  const doDelete = useServerFn(deleteContract);
  const doUpdate = useServerFn(updateContractBody);

  const statusM = useMutation({
    mutationFn: (v: { id: string; status: string }) => doStatus({ data: v }),
    onSuccess: () => {
      toast.success("Contract bijgewerkt");
      qc.invalidateQueries({ queryKey: ["tikklok:contracts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Contract verwijderd");
      qc.invalidateQueries({ queryKey: ["tikklok:contracts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveBodyM = useMutation({
    mutationFn: (v: { id: string; body: string }) => doUpdate({ data: v }),
    onSuccess: () => {
      toast.success("Contracttekst opgeslagen");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tikklok:contracts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = contractsQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Genereer een contract op basis van een paar parameters; de tekst volgt de Belgische arbeidswetgeving.
        </p>
        <Button onClick={() => setOpen(true)}>
          <FilePlus2 className="h-4 w-4 mr-2" /> Nieuw contract
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Er zijn nog geen contracten gegenereerd.</Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{row.employee_name ?? "Onbekend"}</p>
                  <p className="text-xs text-muted-foreground">
                    {contractTypeLabel(row.contract_type)} · {row.job_title ?? "—"} · start {dateNl(row.starts_on)}
                    {row.ends_on ? ` · tot ${dateNl(row.ends_on)}` : ""}
                  </p>
                </div>
                <span className="eyebrow text-primary">{contractStatusLabel(row.status)}</span>
              </div>
              {row.employee_signed_at && (
                <p className="text-xs text-muted-foreground">
                  Ondertekend door {row.employee_signed_name} op{" "}
                  {new Date(row.employee_signed_at).toLocaleString("nl-BE")}
                </p>
              )}
              {row.employee_signature_image && (
                <img alt="Handtekening werknemer" src={row.employee_signature_image} className="h-16 max-w-full rounded border border-border bg-signature-paper" />
              )}
              {row.employer_signature_image && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Zaakvoerder: {row.employer_signed_name} · {row.employer_signed_at ? new Date(row.employer_signed_at).toLocaleString("nl-BE") : ""}</p>
                  <img alt="Handtekening zaakvoerder" src={row.employer_signature_image} className="h-16 max-w-full rounded border border-border bg-signature-paper" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {canEmployerSign(row) && (
                  <Button size="sm" variant="outline" onClick={() => {
                    setSigning(row);
                    setSignName(companyQ.data?.representative_name ?? "");
                    setSignImage(null);
                  }}><FileSignature className="h-4 w-4 mr-1" /> Tekenen als zaakvoerder</Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(row);
                    setBodyDraft(row.body);
                  }}
                >
                  Tekst bekijken
                </Button>
                <Button size="sm" variant="outline" onClick={() => printContract(row)}>
                  <Printer className="h-4 w-4 mr-1" /> Afdrukken
                </Button>
                {row.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => statusM.mutate({ id: row.id, status: "awaiting_signature" })}
                  >
                    <Send className="h-4 w-4 mr-1" /> Laten tekenen door werknemer
                  </Button>
                )}
                {row.status === "signed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusM.mutate({ id: row.id, status: "archived" })}
                  >
                    <Archive className="h-4 w-4 mr-1" /> Archiveren
                  </Button>
                )}
                {row.status !== "signed" && (
                  <Button size="sm" variant="ghost" onClick={() => deleteM.mutate(row.id)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Verwijderen
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <GenerateDialog open={open} onOpenChange={setOpen} />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contracttekst</DialogTitle>
          </DialogHeader>
          <Textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            className="min-h-[60vh] font-mono text-xs"
            readOnly={!editing || !canEditContractText(editing)}
          />
          <DialogFooter>
            {editing && canEditContractText(editing) && (
              <Button variant="outline" onClick={() => setBodyDraft(removeUnselectedContractOptions(bodyDraft))}>
                Niet-aangevinkte opties verwijderen
              </Button>
            )}
            {editing && canEditContractText(editing) && (
              <Button onClick={() => saveBodyM.mutate({ id: editing.id, body: bodyDraft })}>
                <Save className="h-4 w-4 mr-2" /> Opslaan
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!signing} onOpenChange={(v) => { if (!v && !signM.isPending) setSigning(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ondertekenen als zaakvoerder</DialogTitle></DialogHeader>
          <p className="text-sm font-medium">{signing?.employee_name}</p>
          <div className="whitespace-pre-wrap text-xs leading-relaxed max-h-[35vh] overflow-y-auto border border-border rounded-md p-4">{signing?.body}</div>
          <div className="space-y-2">
            <Label htmlFor="employer-sign-name">Je volledige naam</Label>
            <Input id="employer-sign-name" value={signName} onChange={(e) => setSignName(e.target.value)} />
          </div>
          <SignaturePad key={signing?.id} onChange={setSignImage} />
          <DialogFooter>
            <Button variant="outline" disabled={signM.isPending} onClick={() => setSigning(null)}>Annuleren</Button>
            <Button disabled={signM.isPending || !signImage || signName.trim().length < 3} onClick={() => signM.mutate()}><FileSignature className="h-4 w-4 mr-2" /> {signM.isPending ? "Opslaan…" : "Ondertekenen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const emptyForm = {
  employee_id: "",
  contract_type: "indefinite",
  job_title: "",
  workplace: "",
  starts_on: "",
  ends_on: "",
  weekly_hours: "38",
  schedule: "",
  wage_mode: "monthly",
  wage_amount: "",
  joint_committee: "",
  trial_clause: "",
  notice_clause: "",
  extra_clauses: "",
  student_yearly_hours: "650",
  national_number: "",
  benefits: [] as string[],
};

function GenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const employeesQ = useQuery({ queryKey: ["tikklok:employees"], queryFn: () => listEmployees() });
  const [form, setForm] = useState(emptyForm);
  const doGenerate = useServerFn(generateContract);
  const doDefaults = useServerFn(getContractDefaults);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const prefillM = useMutation({
    mutationFn: (employeeId: string) => doDefaults({ data: { employee_id: employeeId } }),
    onSuccess: (d) => {
      setForm((f) => ({
        ...f,
        contract_type: d.contract_type,
        job_title: d.job_title || f.job_title,
        workplace: d.workplace || f.workplace,
        starts_on: d.starts_on || f.starts_on,
        weekly_hours: d.weekly_hours || f.weekly_hours,
        schedule: d.schedule || f.schedule,
        wage_mode: d.wage_mode,
        wage_amount: d.wage_amount || f.wage_amount,
        joint_committee: d.joint_committee || f.joint_committee,
        national_number: d.national_number || f.national_number,
      }));
      if (d.missing.length > 0) {
        toast.warning(`Nog niet in het dossier: ${d.missing.join(", ")}. Vul die hier manueel aan.`);
      } else {
        toast.success("Gegevens uit het dossier overgenomen");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pickEmployee = (id: string) => {
    set("employee_id")(id);
    prefillM.mutate(id);
  };


  const genM = useMutation({
    mutationFn: () => doGenerate({ data: { ...form, ends_on: form.ends_on || null } }),
    onSuccess: () => {
      toast.success("Contract gegenereerd — klaar om naar de medewerker te sturen");
      setForm(emptyForm);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["tikklok:contracts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsEnd = form.contract_type === "fixed_term" || form.contract_type === "student";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuw contract genereren</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-2">
              Kies een medewerker: functie, startdatum, uren, loon en plaats worden automatisch uit zijn dossier
              gehaald. Na het genereren wordt het dossier bijgewerkt met de gegevens van het contract.
            </p>
            <Label>Medewerker</Label>
            <Select value={form.employee_id} onValueChange={pickEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Kies een medewerker" />
              </SelectTrigger>
              <SelectContent>
                {(employeesQ.data ?? []).map((e: { id: string; name: string }) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Type contract</Label>
            <Select value={form.contract_type} onValueChange={set("contract_type")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Functie</Label>
            <Input value={form.job_title} onChange={(e) => set("job_title")(e.target.value)} />
          </div>
          <div>
            <Label>Plaats van uitvoering</Label>
            <Input
              value={form.workplace}
              placeholder="Leeg = adres firma"
              onChange={(e) => set("workplace")(e.target.value)}
            />
          </div>
          <div>
            <Label>Startdatum</Label>
            <Input type="date" value={form.starts_on} onChange={(e) => set("starts_on")(e.target.value)} />
          </div>
          <div>
            <Label>Einddatum {needsEnd ? "(verplicht)" : "(optioneel)"}</Label>
            <Input type="date" value={form.ends_on} onChange={(e) => set("ends_on")(e.target.value)} />
          </div>
          <div>
            <Label>Uren per week</Label>
            <Input
              inputMode="decimal"
              value={form.weekly_hours}
              onChange={(e) => set("weekly_hours")(e.target.value)}
            />
          </div>
          <div>
            <Label>Loonvorm</Label>
            <Select value={form.wage_mode} onValueChange={set("wage_mode")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Maandloon</SelectItem>
                <SelectItem value="hourly">Uurloon</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Brutoloon (€)</Label>
            <Input
              inputMode="decimal"
              value={form.wage_amount}
              onChange={(e) => set("wage_amount")(e.target.value)}
            />
          </div>
          <div>
            <Label>Paritair comité</Label>
            <Input
              value={form.joint_committee}
              placeholder="Leeg = zoals bij firmagegevens"
              onChange={(e) => set("joint_committee")(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Uurregeling</Label>
            <Input
              value={form.schedule}
              placeholder="bv. ma–vr van 8u tot 16u30"
              onChange={(e) => set("schedule")(e.target.value)}
            />
          </div>
          {form.contract_type === "student" && (
            <div>
              <Label>Uren studentencontingent</Label>
              <Input
                inputMode="numeric"
                value={form.student_yearly_hours}
                onChange={(e) => set("student_yearly_hours")(e.target.value)}
              />
            </div>
          )}
          <div>
            <Label>Rijksregisternummer</Label>
            <Input
              value={form.national_number}
              onChange={(e) => set("national_number")(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Bijzondere clausule (optioneel)</Label>
            <Textarea value={form.trial_clause} onChange={(e) => set("trial_clause")(e.target.value)} />
          </div>
          <fieldset className="sm:col-span-2 space-y-3">
            <legend className="text-sm font-medium mb-2">Extralegale voordelen (optioneel)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONTRACT_BENEFITS.map((benefit) => (
                <Label key={benefit.value} className="flex items-center gap-2" htmlFor={`benefit-${benefit.value}`}>
                  <Checkbox
                    id={`benefit-${benefit.value}`}
                    checked={form.benefits.includes(benefit.value)}
                    onCheckedChange={(checked) => setForm((previous) => ({
                      ...previous,
                      benefits: checked === true
                        ? [...previous.benefits.filter((value) => value !== benefit.value), benefit.value]
                        : previous.benefits.filter((value) => value !== benefit.value),
                    }))}
                  />
                  {benefit.label}
                </Label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <Label>Afspraak over opzeg (optioneel)</Label>
            <Textarea value={form.notice_clause} onChange={(e) => set("notice_clause")(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Bijkomende afspraken (optioneel)</Label>
            <Textarea value={form.extra_clauses} onChange={(e) => set("extra_clauses")(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => genM.mutate()} disabled={genM.isPending}>
            <FilePlus2 className="h-4 w-4 mr-2" /> Genereren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COMPANY_FIELDS: { key: keyof CompanySettings; label: string; wide?: boolean }[] = [
  { key: "company_name", label: "Naam vennootschap" },
  { key: "legal_form", label: "Rechtsvorm (bv. BV, NV)" },
  { key: "street_address", label: "Straat en nummer", wide: true },
  { key: "postal_code", label: "Postcode" },
  { key: "city", label: "Gemeente" },
  { key: "country", label: "Land" },
  { key: "enterprise_number", label: "Ondernemingsnummer" },
  { key: "vat_number", label: "Btw-nummer" },
  { key: "rsz_number", label: "RSZ-nummer" },
  { key: "joint_committee", label: "Standaard paritair comité" },
  { key: "representative_name", label: "Vertegenwoordiger" },
  { key: "representative_role", label: "Functie vertegenwoordiger" },
  { key: "phone", label: "Telefoon" },
  { key: "email", label: "E-mail" },
  { key: "website", label: "Website" },
  { key: "workplace_address", label: "Standaard arbeidsplaats", wide: true },
  { key: "insurance_company", label: "Arbeidsongevallenverzekeraar" },
  { key: "social_secretariat", label: "Sociaal secretariaat" },
  { key: "default_weekly_hours", label: "Standaard uren/week" },
  { key: "default_schedule", label: "Standaard uurregeling", wide: true },
];

function CompanyForm() {
  const qc = useQueryClient();
  const companyQ = useQuery({ queryKey: ["tikklok:company-settings"], queryFn: () => getCompanySettings() });
  const doSave = useServerFn(saveCompanySettings);
  const [draft, setDraft] = useState<CompanySettings | null>(null);
  const value = draft ?? companyQ.data ?? null;

  const saveM = useMutation({
    mutationFn: () => doSave({ data: value as CompanySettings & { id: string } }),
    onSuccess: () => {
      toast.success("Firmagegevens opgeslagen");
      qc.invalidateQueries({ queryKey: ["tikklok:company-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!value) return <Card className="p-6 text-sm text-muted-foreground">Laden…</Card>;

  return (
    <Card className="p-6 space-y-4">
      <p className="text-sm text-muted-foreground">
        Deze gegevens komen automatisch op elk gegenereerd contract.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {COMPANY_FIELDS.map((field) => (
          <div key={field.key} className={field.wide ? "sm:col-span-2" : undefined}>
            <Label>{field.label}</Label>
            <Input
              value={String(value[field.key] ?? "")}
              onChange={(e) => setDraft({ ...value, [field.key]: e.target.value })}
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <Label>Vaste bijkomende clausules op elk contract</Label>
          <Textarea
            value={value.extra_clauses ?? ""}
            onChange={(e) => setDraft({ ...value, extra_clauses: e.target.value })}
          />
        </div>
      </div>
      <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
        <Save className="h-4 w-4 mr-2" /> Opslaan
      </Button>
    </Card>
  );
}
