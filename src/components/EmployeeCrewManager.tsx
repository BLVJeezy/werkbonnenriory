import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Share2, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crewInvitationText, crewWhatsAppLink } from "@/lib/crew-whatsapp";
import {
  createAllEmployeeLogins,
  createEmployeeLogin,
  inviteEmployeePassword,
  setEmployeeCrews,
} from "@/lib/employee-crew.functions";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(startIso: string, endIso: string | null) {
  const ms = Math.max(0, (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime());
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return `${hours} u`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem > 0 ? `${days} d ${rem} u` : `${days} d`;
}

export function EmployeeCrewManager() {
  const qc = useQueryClient();
  const createOne = useServerFn(createEmployeeLogin);
  const createAll = useServerFn(createAllEmployeeLogins);
  const inviteOne = useServerFn(inviteEmployeePassword);
  const saveCrews = useServerFn(setEmployeeCrews);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filterEmp, setFilterEmp] = useState("all");
  const [filterCrew, setFilterCrew] = useState("all");
  const [invitation, setInvitation] = useState<{ name: string; phone: string; setupUrl: string } | null>(null);
  const messageField = useRef<HTMLTextAreaElement>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ["tk_employees_crew"],
    queryFn: async () =>
      (await supabase.from("tk_employees").select("id, name, active, user_id, current_technician_id").eq("active", true).order("name")).data ?? [],
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["tk_employee_phones"],
    queryFn: async () => (await supabase.from("tk_employee_profiles").select("employee_id, phone")).data ?? [],
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["technicians"],
    queryFn: async () => (await supabase.from("technicians").select("id, name, color, external_planning").order("name")).data ?? [],
  });

  const { data: crewLinks = [] } = useQuery({
    queryKey: ["tk_employee_crews"],
    queryFn: async () => (await supabase.from("tk_employee_crews").select("employee_id, technician_id")).data ?? [],
  });

  const { data: history = [] } = useQuery({
    queryKey: ["tk_employee_crew_assignments"],
    queryFn: async () =>
      (
        await supabase
          .from("tk_employee_crew_assignments")
          .select("id, employee_id, technician_id, started_at, ended_at, note")
          .order("started_at", { ascending: false })
          .limit(200)
      ).data ?? [],
  });

  const internalCrews = crews.filter((c) => !c.external_planning);
  const phoneByEmp = new Map(profiles.map((p) => [p.employee_id, p.phone ?? ""]));
  const empNameById = new Map(employees.map((e) => [e.id, e.name]));
  const crewById = new Map(crews.map((c) => [c.id, c]));
  const withoutLogin = employees.filter((e) => !e.user_id);
  const allowedByEmp = new Map<string, Set<string>>();
  for (const link of crewLinks) {
    const set = allowedByEmp.get(link.employee_id) ?? new Set<string>();
    set.add(link.technician_id);
    allowedByEmp.set(link.employee_id, set);
  }

  const filteredHistory = history.filter((row) => {
    if (filterEmp !== "all" && row.employee_id !== filterEmp) return false;
    if (filterCrew !== "all" && row.technician_id !== filterCrew) return false;
    return true;
  });

  const invitationText = invitation ? crewInvitationText(invitation.name, invitation.setupUrl) : "";
  let invitationLink = "";
  let invitationError = "";
  if (invitation) {
    try { invitationLink = crewWhatsAppLink(invitation.name, invitation.phone, invitation.setupUrl); }
    catch (error) { invitationError = error instanceof Error ? error.message : "Ongeldig telefoonnummer"; }
  }

  async function copyInvitation() {
    try {
      await navigator.clipboard.writeText(invitationText);
      toast.success("Uitnodiging gekopieerd. Plak het bericht in WhatsApp.");
    } catch {
      messageField.current?.focus();
      messageField.current?.select();
      toast.info("Selecteer en kopieer het bericht hieronder.");
    }
  }

  async function shareInvitation() {
    if (!navigator.share) { await copyInvitation(); return; }
    try { await navigator.share({ text: invitationText }); }
    catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copyInvitation();
    }
  }

  async function handleBulkCreate() {
    setBulkBusy(true);
    try {
      const res = await createAll();
      if (res.created.length > 0) toast.success(`Logins aangemaakt voor: ${res.created.join(", ")}`);
      if (res.skipped.length > 0) toast.error(`Overgeslagen (naam bestaat al): ${res.skipped.join(", ")}`);
      qc.invalidateQueries({ queryKey: ["tk_employees_crew"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logins aanmaken mislukt");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleToggleCrew(employeeId: string, technicianId: string) {
    const current = new Set(allowedByEmp.get(employeeId) ?? []);
    if (current.has(technicianId)) current.delete(technicianId);
    else current.add(technicianId);
    setBusyId(employeeId);
    try {
      await saveCrews({ data: { employeeId, technicianIds: [...current] } });
      toast.success("Ploegtoegang bijgewerkt");
      qc.invalidateQueries({ queryKey: ["tk_employees_crew"] });
      qc.invalidateQueries({ queryKey: ["tk_employee_crews"] });
      qc.invalidateQueries({ queryKey: ["tk_employee_crew_assignments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toewijzen mislukt");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold"><Users className="size-4" />Medewerkers uit tikklok</h3>
          <p className="text-sm text-muted-foreground">Geef elke medewerker een eigen login en vink aan tot welke ploegen hij toegang krijgt. De medewerker kiest bovenaan zijn actieve ploeg; elke wissel wordt hieronder getraceerd.</p>
        </div>
        {withoutLogin.length > 0 && (
          <Button type="button" size="sm" disabled={bulkBusy} onClick={handleBulkCreate}>
            <UserPlus className="size-4" />
            {bulkBusy ? "Aanmaken…" : `Logins aanmaken voor alle medewerkers (${withoutLogin.length})`}
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-md border bg-card">
        {employees.length === 0 && <li className="p-4 text-sm text-muted-foreground">Geen actieve medewerkers in de tikklok.</li>}
        {employees.map((emp) => {
          const allowed = allowedByEmp.get(emp.id) ?? new Set<string>();
          const activeCrew = emp.current_technician_id ? crewById.get(emp.current_technician_id) : null;
          return (
          <li key={emp.id} className="space-y-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold">{emp.name}</div>
                <div className="text-sm text-muted-foreground">
                  {emp.user_id ? `login: ${emp.name}` : "Nog geen login"}
                  {activeCrew && ` · Actief in: ${activeCrew.name}`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!emp.user_id ? (
                <Button
                  size="sm"
                  type="button"
                  disabled={busyId === emp.id}
                  onClick={async () => {
                    setBusyId(emp.id);
                    try {
                      const res = await createOne({ data: { employeeId: emp.id } });
                      toast.success(`Login aangemaakt voor ${emp.name}`);
                      setInvitation({ name: emp.name, phone: phoneByEmp.get(emp.id) ?? "", setupUrl: res.setupUrl });
                      qc.invalidateQueries({ queryKey: ["tk_employees_crew"] });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Login aanmaken mislukt");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  <UserPlus className="size-4" />Login aanmaken
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  disabled={busyId === emp.id}
                  onClick={async () => {
                    setBusyId(emp.id);
                    try {
                      const res = await inviteOne({ data: { employeeId: emp.id } });
                      setInvitation({ name: emp.name, phone: phoneByEmp.get(emp.id) ?? "", setupUrl: res.setupUrl });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Uitnodigen mislukt");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  <MessageCircle className="size-4" />Uitnodigen via WhatsApp
                </Button>
              )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {internalCrews.map((c) => {
                const checked = allowed.has(c.id);
                const isActive = emp.current_technician_id === c.id;
                return (
                  <label
                    key={c.id}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${checked ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={checked}
                      disabled={busyId === emp.id}
                      onChange={() => handleToggleCrew(emp.id, c.id)}
                    />
                    <span className="inline-block size-2 rounded-full" style={{ backgroundColor: c.color ?? "#f97316" }} />
                    <span>{c.name}</span>
                    {isActive && <span className="text-[10px] font-semibold text-primary">(actief)</span>}
                  </label>
                );
              })}
            </div>
          </li>
          );
        })}
      </ul>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold">Ploegtracking (wie werkte in welke ploeg)</h4>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filter op medewerker" className="h-8 rounded-md border bg-background px-2 text-sm" value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)}>
              <option value="all">Alle medewerkers</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select aria-label="Filter op ploeg" className="h-8 rounded-md border bg-background px-2 text-sm" value={filterCrew} onChange={(e) => setFilterCrew(e.target.value)}>
              <option value="all">Alle ploegen</option>
              {internalCrews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-md border bg-card">
          {filteredHistory.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nog geen ploegtoewijzingen geregistreerd.</p>
          ) : (
            <ul className="divide-y text-sm">
              {filteredHistory.map((row) => {
                const crew = crewById.get(row.technician_id);
                return (
                  <li key={row.id} className="grid gap-1 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-3">
                    <div className="font-medium">{empNameById.get(row.employee_id) ?? "Medewerker"}</div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: crew?.color ?? "#f97316" }} />
                      <span>{crew?.name ?? "Onbekende ploeg"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:justify-end">
                      <span>{formatDateTime(row.started_at)}</span>
                      <span>→</span>
                      {row.ended_at ? <span>{formatDateTime(row.ended_at)}</span> : <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">Actief</span>}
                      <span className="font-mono">({formatDuration(row.started_at, row.ended_at)})</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={invitation !== null} onOpenChange={(open) => { if (!open) setInvitation(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{invitation?.name} uitnodigen</DialogTitle>
            <DialogDescription>De medewerker krijgt zijn loginnaam en een persoonlijke link om zelf een wachtwoord te kiezen. De link is 72 uur geldig.</DialogDescription>
          </DialogHeader>
          <Input aria-label="WhatsApp-telefoonnummer" type="tel" placeholder="Bijvoorbeeld +32 470 12 34 56" value={invitation?.phone ?? ""} onChange={(e) => setInvitation((current) => current ? { ...current, phone: e.target.value } : null)} />
          {invitationError && <p className="text-sm text-destructive" role="alert">{invitationError}</p>}
          <Button asChild disabled={!invitationLink}>
            {invitationLink ? <a href={invitationLink} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" />Openen in WhatsApp</a> : <span><MessageCircle className="size-4" />Openen in WhatsApp</span>}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={shareInvitation}><Share2 className="size-4" />Delen</Button>
            <Button type="button" variant="outline" onClick={copyInvitation}><Copy className="size-4" />Bericht kopiëren</Button>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Uitnodigingsbericht</summary>
            <textarea ref={messageField} aria-label="Uitnodigingsbericht" readOnly value={invitationText} className="mt-2 h-48 w-full resize-none rounded-md border bg-background p-3 text-foreground" />
          </details>
        </DialogContent>
      </Dialog>
    </div>
  );
}