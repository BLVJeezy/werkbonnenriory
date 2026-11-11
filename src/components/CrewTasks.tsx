import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { usePerms } from "@/lib/use-role";
import { TaskActions, isNoAnswer } from "@/components/TaskActions";
import { crewStyle } from "@/lib/crew-color";
import { crewBuckets } from "@/lib/schedule";
import { RunningTask } from "@/components/RunningTask";
import { werkbonNr } from "@/lib/werkbon-number";
import { isUrgentOpen, URGENT_RING } from "@/lib/urgent";
import { destinationAddress, destinationLabel, destinationLines, type SiteAddressParts } from "@/lib/address";
import { WorkOrderPreview } from "@/components/WorkOrderPreview";
import { WerkbonMailButton } from "@/components/WerkbonMailButton";
import { FirstCustomerLabel } from "@/components/FirstCustomerLabel";
import { OnderwegSms } from "@/components/OnderwegSms";
import { showOnderwegSms } from "@/lib/onderweg-sms";

type Row = SiteAddressParts & {
  technicians?: { name: string; color: string | null; manual_time_entry?: boolean | null } | null;
  sort_order: number;
  scheduled_date: string | null;
  id: string;
  number: number | null;
  customer_name: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  description: string | null;
  status: string;
  urgent?: boolean;
  first_customer?: boolean;
  no_invoice?: boolean;
  no_answer_at?: string | null;
  contract_id?: string | null;
  quote_approved?: boolean;
  technician_id?: string | null;
  activity_id?: string | null;
  time_entries: { id: string; started_at: string; ended_at: string | null }[];
};

export function CrewTasks({ rows }: { rows: Row[] }) {
  const b = crewBuckets(rows.filter((w) => w.status !== "afgetekend"));
  const group = (title: string, list: Row[], empty: string) => (
    <section className="space-y-3">
      <h2 className="text-xl font-black uppercase">{title}</h2>
      {list.length === 0 && <div className="rounded-md border bg-card p-4 text-muted-foreground">{empty}</div>}
      {list.map((w) => <RowLink key={w.id} w={w} label="Taak" />)}
    </section>
  );
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-black uppercase">Kalender</h1>
      {group("Vandaag", b.today, "Geen taken vandaag.")}
      {group("Morgen", b.tomorrow, "Geen taken morgen.")}
      {b.unplanned.length > 0 && group("Nog in te plannen", b.unplanned, "")}
    </div>
  );
}

function RowLink({ w, label, extra, below }: { w: Row; label: string; extra?: React.ReactNode; below?: React.ReactNode }) {
  const showContact = usePerms()?.showContact ?? false;
  const running = w.time_entries?.find((t) => !t.ended_at);
  const signed = w.status === "afgetekend";
  return (
    <div style={crewStyle(w.technicians?.color)} className={`relative min-w-0 space-y-3 rounded-md border-l-4 border-primary bg-card p-3 shadow-sm sm:p-4 ${signed ? "" : "pt-12 sm:pt-12"} ${isUrgentOpen(w) ? URGENT_RING : ""} ${running ? "task-running" : ""}`}>
      {w.quote_approved && <Badge variant="secondary">Offerte goedgekeurd</Badge>}
      {w.first_customer && <FirstCustomerLabel />}
      {!signed && isNoAnswer(w.no_answer_at) && <Badge variant="destructive">Neemt niet op · {new Date(w.no_answer_at ?? "").toLocaleString("nl-BE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</Badge>}
      {(isUrgentOpen(w) || w.contract_id || w.no_invoice) && <div className="flex gap-2 text-xs font-bold">{isUrgentOpen(w) && <span className="animate-pulse rounded bg-destructive px-2 py-0.5 text-destructive-foreground">DRINGEND — vandaag helpen</span>}{w.contract_id && <span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">Contract — niet factureren</span>}{!w.contract_id && w.no_invoice && <span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">Niet factureren</span>}</div>}
      {running && <RunningTask entries={w.time_entries} crewName={w.technicians?.name} />}
      <Link to="/werkbonnen/$id" params={{ id: w.id }} className="grid min-w-0 grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-4">
        <span className="font-mono text-sm opacity-80">{label} {werkbonNr(w.number)}</span>
        <div className="col-span-full row-start-1 min-w-0 break-words sm:flex-1">
          <div className="font-bold underline-offset-2 hover:underline">{w.customer_name}</div>
          <AddressBlock w={w} />
          {w.description ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{w.description}</p>
          ) : (
            <p className="mt-1 text-sm italic opacity-80">Geen omschrijving</p>
          )}
        </div>
        {extra}
      </Link>
      {below}
      <div className="flex flex-wrap items-center gap-2">
        {signed && <WorkOrderPreview workOrderId={w.id} />}
        {signed && <WerkbonMailButton workOrderId={w.id} email={w.email} />}
        {!signed && <TaskActions id={w.id} address={destinationAddress(w)} phone={showContact ? w.phone : null} contactPhone={w.site_contact_phone} contactName={w.site_contact_name} runningEntryId={running?.id ?? null} manualTime={!!w.technicians?.manual_time_entry} noAnswerAt={w.no_answer_at} />}
      </div>
      {showOnderwegSms(w.status) && <OnderwegSms compact workOrderId={w.id} />}
    </div>
  );
}

/** Het adres waar de ploeg naartoe gaat, volledig en in regels zoals op een envelop. */
function AddressBlock({ w }: { w: Row }) {
  const lines = destinationLines(w);
  return (
    <div className="mt-0.5">
      <div className="text-xs font-bold uppercase tracking-wide opacity-70">{destinationLabel(w)}</div>
      {lines.length ? (
        <div className="break-words font-medium leading-snug">{lines.map((l) => <div key={l}>{l}</div>)}</div>
      ) : (
        <div className="text-muted-foreground">Geen adres</div>
      )}
    </div>
  );
}
