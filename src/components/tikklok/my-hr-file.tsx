import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, ExternalLink } from "lucide-react";
import { EMPLOYEE_DOCUMENT_TYPES, uploadMyDocument, signMyContract } from "@/lib/tikklok/hr.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { contractTypeLabel } from "@/lib/tikklok/contract-types";
import { SignaturePad } from "@/components/tikklok/signature-pad";

export type HrFile = {
  name: string;
  contracts?: {
    id: string;
    contract_type: string;
    status: string;
    job_title: string | null;
    starts_on: string | null;
    ends_on: string | null;
    body: string;
    employee_signed_name: string | null;
    employee_signed_at: string | null;
    employee_signature_image?: string | null;
    employer_signed_name?: string | null;
    employer_signed_at?: string | null;
    employer_signature_image?: string | null;
    created_at: string;
  }[];
  profile: {
    job_title: string | null;
    department: string | null;
    contract_type: string | null;
    employment_start_date: string | null;
    weekly_hours: number | null;
    employment_status: string;
    email: string | null;
    phone: string | null;
  } | null;
  documents: {
    id: string;
    title: string;
    document_type: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    expires_on: string | null;
    created_at: string;
    url: string | null;
  }[];
};

const typeLabel = (value: string) =>
  EMPLOYEE_DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? "Document";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Bestand kon niet worden gelezen"));
    reader.readAsDataURL(file);
  });
}

export function MyHrFile({
  data,
  pin,
  deviceToken,
  onClose,
  onRefresh,
}: {
  data: HrFile;
  pin: string;
  deviceToken: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const doUpload = useServerFn(uploadMyDocument);
  const doSign = useServerFn(signMyContract);
  const [signing, setSigning] = useState<null | { id: string; title: string; body: string }>(null);
  const [signName, setSignName] = useState("");
  const [signBusy, setSignBusy] = useState(false);
  const [signImage, setSignImage] = useState<string | null>(null);

  async function handleSign() {
    if (!signing) return;
    setSignBusy(true);
    try {
      await doSign({ data: { pin, deviceToken, id: signing.id, fullName: signName, signatureImage: signImage ?? "" } });
      setSignImage(null);
      toast.success("Contract ondertekend");
      setSigning(null);
      setSignName("");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ondertekenen mislukt");
    } finally {
      setSignBusy(false);
    }
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("drivers_license");
  const [expires, setExpires] = useState("");
  const [uploading, setUploading] = useState(false);

  const contracts = data.documents.filter((d) => d.document_type === "contract");
  const others = data.documents.filter((d) => d.document_type !== "contract");
  const viewedContract = data.contracts?.find((c) => c.id === signing?.id);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Kies eerst een bestand");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Bestand is groter dan 8 MB");
      return;
    }
    setUploading(true);
    try {
      const contentBase64 = await fileToBase64(file);
      await doUpload({
        data: {
          pin,
          deviceToken,
          documentType: docType,
          title: `${typeLabel(docType)} – ${data.name}`,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64,
          expiresOn: expires || null,
        },
      });
      toast.success("Document opgeladen");
      if (fileRef.current) fileRef.current.value = "";
      setExpires("");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Uploaden mislukt");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Mijn dossier – {data.name}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Sluiten
        </Button>
      </div>

      {data.profile && (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-5">
          {data.profile.job_title && <span>Functie: {data.profile.job_title}</span>}
          {data.profile.contract_type && <span>Contract: {data.profile.contract_type}</span>}
          {data.profile.employment_start_date && (
            <span>In dienst: {new Date(data.profile.employment_start_date).toLocaleDateString("nl-BE")}</span>
          )}
          {data.profile.weekly_hours != null && <span>Uren/week: {data.profile.weekly_hours}</span>}
        </div>
      )}

      <p className="eyebrow text-primary mb-2">Mijn arbeidsovereenkomsten</p>
      {(data.contracts ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground mb-5">Er staat geen overeenkomst klaar.</p>
      ) : (
        <ul className="divide-y mb-5">
          {(data.contracts ?? []).map((c) => (
            <li key={c.id} className="py-3 text-sm space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> {contractTypeLabel(c.contract_type)}
                </span>
                <span className="text-xs uppercase text-muted-foreground">
                  {c.employee_signed_at ? "Ondertekend" : "Te ondertekenen"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {c.job_title ?? ""}
                {c.starts_on ? ` · start ${new Date(c.starts_on).toLocaleDateString("nl-BE")}` : ""}
                {c.employee_signed_at
                  ? ` · ondertekend op ${new Date(c.employee_signed_at).toLocaleDateString("nl-BE")}`
                  : ""}
              </p>
              <Button
                size="sm"
                variant={c.employee_signed_at ? "outline" : "default"}
                onClick={() => {
                  setSigning({ id: c.id, title: contractTypeLabel(c.contract_type), body: c.body });
                  setSignName(c.employee_signed_name ?? data.name);
                }}
              >
                {c.employee_signed_at ? "Bekijken" : "Lezen en ondertekenen"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="eyebrow text-primary mb-2">Contracten</p>
      {contracts.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-5">Er staan nog geen contracten in je dossier.</p>
      ) : (
        <ul className="divide-y mb-5">
          {contracts.map((d) => (
            <li key={d.id} className="py-2 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> {d.title}
              </span>
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs uppercase">
                  Bekijken <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="eyebrow text-primary mb-2">Mijn documenten</p>
      {others.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-5">Nog geen documenten opgeladen.</p>
      ) : (
        <ul className="divide-y mb-5">
          {others.map((d) => (
            <li key={d.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> {typeLabel(d.document_type)}
                </span>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs uppercase">
                    Bekijken <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {d.file_name} · {(d.file_size / 1024).toFixed(0)} kB
                {d.expires_on ? ` · geldig tot ${new Date(d.expires_on).toLocaleDateString("nl-BE")}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-3 border-t border-border/60 pt-4">
        <p className="eyebrow text-primary">Document opladen</p>
        <div>
          <Label>Type document</Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYEE_DOCUMENT_TYPES.filter((t) => t.value !== "contract").map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="doc-file">Bestand (max 8 MB)</Label>
          <Input id="doc-file" ref={fileRef} type="file" accept="image/*,application/pdf" />
        </div>
        <div>
          <Label htmlFor="doc-expires">Geldig tot (optioneel)</Label>
          <Input id="doc-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <Button onClick={handleUpload} disabled={uploading} className="w-full">
          <Upload className="h-4 w-4 mr-2" /> Opladen
        </Button>
      </div>

      <Dialog open={!!signing} onOpenChange={(v) => !v && setSigning(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{signing?.title}</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-xs leading-relaxed border border-border/60 rounded-md p-4 max-h-[50vh] overflow-y-auto">
            {signing?.body}
          </div>
          {viewedContract?.employer_signature_image && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Zaakvoerder: {viewedContract.employer_signed_name} · {viewedContract.employer_signed_at ? new Date(viewedContract.employer_signed_at).toLocaleString("nl-BE") : ""}</p>
              <img alt="Handtekening zaakvoerder" className="h-20 max-w-full rounded border border-border bg-signature-paper" src={viewedContract.employer_signature_image} />
            </div>
          )}
          {viewedContract?.employee_signed_at ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Dit contract is al ondertekend.</p>
              {viewedContract.employee_signature_image && (
                <img alt="Handtekening werknemer" className="h-24 max-w-full rounded border border-border bg-signature-paper" src={viewedContract.employee_signature_image} />
              )}
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="sign-name">Je volledige naam</Label>
                <Input id="sign-name" value={signName} onChange={(e) => setSignName(e.target.value)} />
              </div>
              <SignaturePad key={signing?.id} onChange={setSignImage} />
              <DialogFooter>
                <Button onClick={handleSign} disabled={signBusy || !signImage}>
                  Ondertekenen
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
