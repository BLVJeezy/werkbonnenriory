import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUDIO_FILE_ACCEPT,
  COMMUNICATION_AUDIO_BUCKET,
  COMMUNICATION_SCOPE_NOTES,
  validateAudioUploadMeta,
} from "@/lib/communication-audio";
import {
  matchCustomerByPhone,
  type CallDirection,
  type CustomerPhoneRecord,
} from "@/lib/communication-phone";
import {
  deleteCustomerCommunication,
  getAudioPlaybackUrl,
  getCommunicationReadiness,
  listCustomerCommunications,
  prepareAudioUpload,
  registerCustomerAudio,
  type CustomerCommunicationRow,
} from "@/lib/communications.functions";

type ProjectOption = { id: string; name: string; number?: string | null };

export function CustomerCommunicationsTab({
  customerId,
  customerName,
  projects,
  allCustomers,
  syndicusPhones,
}: {
  customerId: string;
  customerName: string;
  projects: ProjectOption[];
  allCustomers: CustomerPhoneRecord[];
  syndicusPhones: (string | null | undefined)[];
}) {
  const qc = useQueryClient();
  const fetchReadiness = useServerFn(getCommunicationReadiness);
  const fetchList = useServerFn(listCustomerCommunications);
  const callPrepare = useServerFn(prepareAudioUpload);
  const callRegister = useServerFn(registerCustomerAudio);
  const callPlayback = useServerFn(getAudioPlaybackUrl);
  const callDelete = useServerFn(deleteCustomerCommunication);

  const { data: readiness, isLoading: loadingReadiness } = useQuery({
    queryKey: ["communication-readiness"],
    queryFn: () => fetchReadiness(),
    staleTime: 60_000,
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ["customer-work-orders-comm", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("id, number, description")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as { id: string; number: number | null; description: string | null }[];
    },
  });

  const { data: recordings = [] } = useQuery({
    queryKey: ["customer-communications", customerId],
    enabled: Boolean(readiness?.ready),
    queryFn: () => fetchList({ data: { customerId } }),
  });

  const [direction, setDirection] = useState<CallDirection>("inbound");
  const [phoneInput, setPhoneInput] = useState("");
  const [confirmedCustomerId, setConfirmedCustomerId] = useState<string>(customerId);
  const [projectId, setProjectId] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [lawfulConfirmed, setLawfulConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activePlayback, setActivePlayback] = useState<{ id: string; url: string } | null>(null);

  const phoneMatch = useMemo(() => {
    if (!phoneInput.trim()) return null;
    return matchCustomerByPhone(
      direction === "inbound"
        ? { direction, callerPhone: phoneInput }
        : { direction, calledPhone: phoneInput },
      allCustomers,
      syndicusPhones,
    );
  }, [direction, phoneInput, allCustomers, syndicusPhones]);

  const handleUpload = async () => {
    if (!readiness?.ready) {
      toast.error("Audio-opslag is uitgeschakeld tot migratie- en beveiligingsreview zijn afgerond.");
      return;
    }
    if (!file) {
      toast.error("Kies eerst een audiobestand.");
      return;
    }
    const check = validateAudioUploadMeta({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      lawfulBasisConfirmed: lawfulConfirmed,
    });
    if (!check.ok) {
      toast.error(check.error);
      return;
    }

    setUploading(true);
    try {
      const targetCustomerId = confirmedCustomerId || customerId;
      const { communicationId, storagePath } = await callPrepare({
        data: {
          customerId: targetCustomerId,
          workOrderId: workOrderId || null,
          projectId: projectId || null,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          lawfulBasisConfirmed: lawfulConfirmed,
        },
      });

      const { error: uploadErr } = await supabase.storage
        .from(COMMUNICATION_AUDIO_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error("Upload naar privé-opslag mislukt.");

      await callRegister({
        data: {
          communicationId,
          customerId: targetCustomerId,
          workOrderId: workOrderId || null,
          projectId: projectId || null,
          direction,
          counterpartPhoneRaw: phoneInput.trim() || null,
          matchStatus: phoneMatch?.status ?? "manual",
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          lawfulBasisConfirmed: lawfulConfirmed,
          notes: notes.trim() || null,
        },
      });

      setFile(null);
      setNotes("");
      setLawfulConfirmed(false);
      qc.invalidateQueries({ queryKey: ["customer-communications", customerId] });
      toast.success("Audio-opname opgeslagen in privé-opslag.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload mislukt.");
    } finally {
      setUploading(false);
    }
  };

  const handlePlay = async (row: CustomerCommunicationRow) => {
    try {
      const res = await callPlayback({
        data: { communicationId: row.id, customerId },
      });
      setActivePlayback({ id: row.id, url: res.url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Afspelen mislukt.");
    }
  };

  const handleDelete = async (row: CustomerCommunicationRow) => {
    if (!confirm("Deze audio-opname definitief verwijderen?")) return;
    try {
      await callDelete({ data: { communicationId: row.id, customerId } });
      if (activePlayback?.id === row.id) setActivePlayback(null);
      qc.invalidateQueries({ queryKey: ["customer-communications", customerId] });
      toast.success("Opname verwijderd.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  };

  return (
    <div className="space-y-4 rounded-md border border-border bg-background p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Communicatie — {customerName}</h4>
        <p className="text-xs text-muted-foreground">
          Alleen toegankelijk voor Riory-beheerders. Niet zichtbaar in het klantenportaal of voor ploegen.
        </p>
      </div>

      {loadingReadiness ? (
        <p className="text-xs text-muted-foreground">Gereedheid controleren…</p>
      ) : readiness && !readiness.ready ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1.5">
          <div className="font-semibold">Audio-opslag is uitgeschakeld (fail-closed)</div>
          <p>
            Upload geen echte klantopnames zolang de migratie-, beveiligings- en bewaartermijnreview niet is
            goedgekeurd. Er wordt niets opgeslagen in localStorage of publieke opslag.
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            {readiness.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="text-xs font-semibold">Handmatige audio-upload & nummerherkenning</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`comm-dir-${customerId}`}>Richting</Label>
            <select
              id={`comm-dir-${customerId}`}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={direction}
              onChange={(e) => setDirection(e.target.value as CallDirection)}
            >
              <option value="inbound">Inkomend (beller = klant)</option>
              <option value="outbound">Uitgaand (gebelde = klant)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`comm-phone-${customerId}`}>
              {direction === "inbound" ? "Nummer beller" : "Gebeld nummer"}
            </Label>
            <Input
              id={`comm-phone-${customerId}`}
              placeholder="bv. 0470 12 34 56 of +31 6 ..."
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
            />
          </div>
        </div>

        {phoneMatch && (
          <div className="rounded border border-border bg-muted/40 p-2 text-xs space-y-1">
            {phoneMatch.status === "matched" && (
              <div>
                Herkend nummer <span className="font-mono">{phoneMatch.e164}</span> →{" "}
                <strong>{phoneMatch.customerName}</strong>
              </div>
            )}
            {phoneMatch.status === "ambiguous" && (
              <div className="space-y-1">
                <div className="font-medium text-amber-700 dark:text-amber-400">
                  Meerdere klanten gevonden voor <span className="font-mono">{phoneMatch.e164}</span> — kies
                  handmatig:
                </div>
                <select
                  aria-label="Bevestig klant bij dubbel nummer"
                  className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                  value={confirmedCustomerId}
                  onChange={(e) => setConfirmedCustomerId(e.target.value)}
                >
                  {phoneMatch.candidates.map((cand) => (
                    <option key={cand.customerId} value={cand.customerId}>
                      {cand.customerName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {phoneMatch.status === "unmatched" && (
              <div className="text-muted-foreground">
                Geen automatische koppeling ({phoneMatch.reason}). Blijft handmatig gekoppeld aan{" "}
                <strong>{customerName}</strong>.
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`comm-wo-${customerId}`}>Werkbon (optioneel)</Label>
            <select
              id={`comm-wo-${customerId}`}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={workOrderId}
              onChange={(e) => setWorkOrderId(e.target.value)}
            >
              <option value="">Geen werkbon</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>
                  {wo.number ? `#${wo.number}` : "Nieuw"} — {(wo.description ?? "").slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`comm-proj-${customerId}`}>Project (optioneel)</Label>
            <select
              id={`comm-proj-${customerId}`}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">Geen project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number ? `${p.number} — ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`comm-file-${customerId}`}>Audiobestand (MP3, M4A, WAV, OGG, WebM — max 25 MB)</Label>
          <Input
            id={`comm-file-${customerId}`}
            type="file"
            accept={AUDIO_FILE_ACCEPT}
            disabled={!readiness?.ready || uploading}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`comm-notes-${customerId}`}>Interne notitie (optioneel)</Label>
          <Input
            id={`comm-notes-${customerId}`}
            value={notes}
            disabled={!readiness?.ready || uploading}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Korte context over het gesprek"
          />
        </div>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-primary"
            checked={lawfulConfirmed}
            disabled={!readiness?.ready || uploading}
            onChange={(e) => setLawfulConfirmed(e.target.checked)}
          />
          <span>Ik bevestig dat deze audio-opname reeds rechtmatig werd opgenomen.</span>
        </label>

        <Button size="sm" disabled={!readiness?.ready || uploading || !file || !lawfulConfirmed} onClick={handleUpload}>
          {uploading ? "Bezig met uploaden…" : "Opname uploaden"}
        </Button>
      </div>

      {readiness?.ready && (
        <div className="space-y-2">
          <div className="text-xs font-semibold">Opgeslagen audio-opnames ({recordings.length})</div>
          {recordings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nog geen opnames voor deze klant.</p>
          ) : (
            <ul className="space-y-2">
              {recordings.map((row) => (
                <li key={row.id} className="rounded border border-border p-2.5 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">
                        {row.direction === "inbound" ? "Inkomend" : "Uitgaand"}
                      </span>{" "}
                      {row.counterpart_phone_e164 && (
                        <span className="font-mono text-muted-foreground">{row.counterpart_phone_e164}</span>
                      )}
                      <span className="ml-2 text-muted-foreground">
                        {new Date(row.created_at).toLocaleString("nl-BE")}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => handlePlay(row)}>
                        Afspelen
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(row)}>
                        Verwijderen
                      </Button>
                    </div>
                  </div>
                  {row.notes && <p className="text-muted-foreground">{row.notes}</p>}
                  {activePlayback?.id === row.id && (
                    <audio
                      controls
                      controlsList="nodownload"
                      src={activePlayback.url}
                      className="w-full"
                      aria-label="Privé audiospeler voor klantopname"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="border-t border-border pt-2 text-[11px] text-muted-foreground space-y-0.5">
        <div>
          <strong>Mailscope (niet actief in deze versie):</strong> {COMMUNICATION_SCOPE_NOTES.mailIncluded.join(", ")}.
          Uitgesloten: {COMMUNICATION_SCOPE_NOTES.mailExcluded.join(", ")}. Geen automatische mailsync.
        </div>
        <div>
          <strong>Telefonie:</strong> Telavox is niet bevestigd; geen providerkoppeling, opnamefunctie of transcriptie
          actief.
        </div>
      </div>
    </div>
  );
}