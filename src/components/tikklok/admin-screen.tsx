import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatSalaryAdvances } from "@/lib/tikklok/salary-advances";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getReport,
  getLiveStatus,
  checkAdmin,
  listAdministrators,
  createAdministrator,
  createManualTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getEmployeeDossier,
  saveEmployeeProfile,
  addEmployeeAbsence,
  addEmployeeNote,
  registerEmployeeDocument,
  listTimeEntryRequests,
  reviewTimeEntryRequest,
  type TimeEntryRequestRow,
} from "@/lib/tikklok/admin.functions";
import { LeaveRequestsPanel } from "@/components/tikklok/leave-requests-panel";
import { MessagesPanel } from "@/components/tikklok/messages-panel";
import { CalendarPanel } from "@/components/tikklok/calendar-panel";
import { IncidentsPanel, QuickIncidentButton } from "@/components/tikklok/incidents-panel";
import { ContractsPanel } from "@/components/tikklok/contracts-panel";
import {
  type ReportRow,
  type LiveStatusRow,
  type Administrator,
} from "@/lib/tikklok/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/tikklok/theme-toggle";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Clock, LogOut, Plus, Pencil, Trash2, Download, Users, FileText, Radio, CircleDot, RefreshCw, FolderOpen, Upload, ShieldCheck, ClipboardList, Check, X, Wallet, MessageSquare, FileSignature, TimerReset } from "lucide-react";
import { PayrollPanel, PayrollCostReports } from "@/components/tikklok/payroll-panel";
import { DossierPayroll } from "@/components/tikklok/dossier-payroll";
import { OvertimeAdminPanel } from "@/components/tikklok/overtime-admin-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteDevice, listDevices, updateDeviceStatus } from "@/lib/tikklok/device-admin.functions";

export function TikklokAdmin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchEmployees = useServerFn(listEmployees);
  const check = useServerFn(checkAdmin);
  const [embedded, setEmbedded] = useState(true);


  const adminQ = useQuery({
    queryKey: ["tikklok:isAdmin"],
    queryFn: () => check({}),
  });

  const employeesQ = useQuery({
    queryKey: ["tikklok:employees"],
    queryFn: () => fetchEmployees({}),
    enabled: adminQ.data?.isAdmin === true,
  });

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (adminQ.isLoading) {
    return <div className="min-h-full flex items-center justify-center text-muted-foreground">Laden...</div>;
  }
  if (!adminQ.data?.isAdmin) {
    return (
      <div className="min-h-full flex items-center justify-center px-4">
        <Card className="p-6 max-w-md text-center">
          <h2 className="text-lg font-semibold">Geen admin-toegang</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Dit account heeft geen beheerdersrechten.
          </p>
          <Button className="mt-4" onClick={handleSignOut}>Uitloggen</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">

      <header className={embedded ? "hidden" : "border-b"}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/tikklok" className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <h1 className="text-lg font-semibold tracking-tight">Tikklok – Admin</h1>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" /> Uitloggen
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <Tabs defaultValue="live">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="live"><Radio className="h-4 w-4 mr-1" /> Live</TabsTrigger>
            <TabsTrigger value="staff"><Users className="h-4 w-4 mr-1" /> Personeel</TabsTrigger>
            <TabsTrigger value="incidents"><ClipboardList className="h-4 w-4 mr-1" /> Vaststellingen</TabsTrigger>
            <TabsTrigger value="reports"><FileText className="h-4 w-4 mr-1" /> Rapporten</TabsTrigger>
            <TabsTrigger value="administrators"><ShieldCheck className="h-4 w-4 mr-1" /> Beheerders</TabsTrigger>
            <TabsTrigger value="requests"><ClipboardList className="h-4 w-4 mr-1" /> Aanvragen</TabsTrigger>
            <TabsTrigger value="overtime"><TimerReset className="h-4 w-4 mr-1" /> Overuren</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="h-4 w-4 mr-1" /> Berichten</TabsTrigger>
            <TabsTrigger value="calendar"><ClipboardList className="h-4 w-4 mr-1" /> Kalender</TabsTrigger>
            <TabsTrigger value="contracts"><FileSignature className="h-4 w-4 mr-1" /> Contracten</TabsTrigger>
            <TabsTrigger value="payroll"><Wallet className="h-4 w-4 mr-1" /> Loon</TabsTrigger>
            <TabsTrigger value="devices"><ShieldCheck className="h-4 w-4 mr-1" /> Toestellen</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-6">
            <LivePanel />
          </TabsContent>

          <TabsContent value="staff" className="mt-6">
            <StaffPanel employees={employeesQ.data ?? []} loading={employeesQ.isLoading} />
          </TabsContent>
          <TabsContent value="incidents" className="mt-6">
            <IncidentsPanel employees={employeesQ.data ?? []} />
          </TabsContent>

          <TabsContent value="reports" className="mt-6">
            <Tabs defaultValue="hours"><TabsList><TabsTrigger value="hours">Werkuren</TabsTrigger><TabsTrigger value="costs">Loonkosten en overuren</TabsTrigger></TabsList><TabsContent value="hours"><ReportsPanel employees={employeesQ.data ?? []} /></TabsContent><TabsContent value="costs"><PayrollCostReports /></TabsContent></Tabs>
          </TabsContent>

          <TabsContent value="administrators" className="mt-6">
            <AdministratorsPanel />
          </TabsContent>
          <TabsContent value="requests" className="mt-6 space-y-6">
            <RequestsPanel />
            <LeaveRequestsPanel />
          </TabsContent>
          <TabsContent value="overtime" className="mt-6">
            <OvertimeAdminPanel />
          </TabsContent>
          <TabsContent value="messages" className="mt-6">
            <MessagesPanel />
          </TabsContent>
          <TabsContent value="calendar" className="mt-6"><CalendarPanel /></TabsContent>
          <TabsContent value="contracts" className="mt-6">
            <ContractsPanel />
          </TabsContent>
          <TabsContent value="payroll" className="mt-6">
            <PayrollPanel />
          </TabsContent>
          <TabsContent value="devices" className="mt-6">
            <DevicesPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

type Employee = { id: string; name: string; active: boolean; created_at: string };

function DevicesPanel() {
  const qc = useQueryClient();
  const fetchDevices = useServerFn(listDevices);
  const updateStatus = useServerFn(updateDeviceStatus);
  const removeDevice = useServerFn(deleteDevice);
  const devicesQ = useQuery({ queryKey: ["tikklok:approvedDevices"], queryFn: () => fetchDevices({}), refetchInterval: 5000 });
  const updateM = useMutation({
    mutationFn: (data: { id: string; status: "approved" | "blocked" }) => updateStatus({ data }),
    onSuccess: () => { toast.success("Toestel bijgewerkt"); qc.invalidateQueries({ queryKey: ["tikklok:approvedDevices"] }); },
    onError: (error: any) => toast.error(error?.message ?? "Bijwerken mislukt"),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => removeDevice({ data: { id } }),
    onSuccess: () => { toast.success("Toestel verwijderd"); qc.invalidateQueries({ queryKey: ["tikklok:approvedDevices"] }); },
    onError: (error: any) => toast.error(error?.message ?? "Verwijderen mislukt"),
  });
  const devices = devicesQ.data ?? [];

  return <Card className="p-4 sm:p-6">
    <div className="mb-4"><h2 className="text-lg font-semibold">Goedgekeurde toestellen</h2><p className="text-sm text-muted-foreground">Alleen goedgekeurde toestellen kunnen de tikklok gebruiken.</p></div>
    {devices.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen toestellen aangemeld.</p> : <>
      {/* Mobiel: kaartweergave zodat de actieknoppen altijd bereikbaar zijn */}
      <div className="space-y-3 md:hidden">{devices.map((device) => <div key={device.id} className="rounded-lg border p-3">
        <p className="font-medium">{device.device_name}</p>
        <p className="text-sm text-muted-foreground">{device.status === "approved" ? "Goedgekeurd" : device.status === "blocked" ? "Geblokkeerd" : "Wacht op goedkeuring"}</p>
        <p className="text-xs text-muted-foreground mt-1">Aangevraagd: {new Date(device.requested_at).toLocaleString("nl-BE")}</p>
        <p className="text-xs text-muted-foreground">Laatst gebruikt: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("nl-BE") : "—"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {device.status !== "approved" && <Button size="sm" disabled={updateM.isPending} onClick={() => updateM.mutate({ id: device.id, status: "approved" })}>Goedkeuren</Button>}
          {device.status !== "blocked" && <Button size="sm" variant="outline" disabled={updateM.isPending} onClick={() => updateM.mutate({ id: device.id, status: "blocked" })}>Blokkeren</Button>}
          <Button size="icon" variant="ghost" aria-label="Toestel verwijderen" onClick={() => deleteM.mutate(device.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>)}</div>
      <div className="hidden md:block"><Table>
        <TableHeader><TableRow><TableHead>Toestel</TableHead><TableHead>Status</TableHead><TableHead>Aangevraagd</TableHead><TableHead>Laatst gebruikt</TableHead><TableHead className="text-right">Acties</TableHead></TableRow></TableHeader>
        <TableBody>{devices.map((device) => <TableRow key={device.id}>
          <TableCell className="font-medium">{device.device_name}</TableCell>
          <TableCell>{device.status === "approved" ? "Goedgekeurd" : device.status === "blocked" ? "Geblokkeerd" : "Wacht op goedkeuring"}</TableCell>
          <TableCell>{new Date(device.requested_at).toLocaleString("nl-BE")}</TableCell>
          <TableCell>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("nl-BE") : "—"}</TableCell>
          <TableCell className="text-right space-x-2">
            {device.status !== "approved" && <Button size="sm" disabled={updateM.isPending} onClick={() => updateM.mutate({ id: device.id, status: "approved" })}>Goedkeuren</Button>}
            {device.status !== "blocked" && <Button size="sm" variant="outline" disabled={updateM.isPending} onClick={() => updateM.mutate({ id: device.id, status: "blocked" })}>Blokkeren</Button>}
            <Button size="icon" variant="ghost" aria-label="Toestel verwijderen" onClick={() => deleteM.mutate(device.id)}><Trash2 className="h-4 w-4" /></Button>
          </TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
    </>}
  </Card>;

}

function AdministratorsPanel() {
  const qc = useQueryClient();
  const fetchAdministrators = useServerFn(listAdministrators);
  const createAdmin = useServerFn(createAdministrator);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const administratorsQ = useQuery({
    queryKey: ["tikklok:administrators"],
    queryFn: () => fetchAdministrators({}),
  });
  const createM = useMutation({
    mutationFn: () => createAdmin({ data: { email, password } }),
    onSuccess: () => {
      toast.success("Beheerder aangemaakt");
      setOpen(false);
      setEmail("");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["tikklok:administrators"] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Aanmaken mislukt"),
  });
  const administrators: Administrator[] = administratorsQ.data ?? [];

  return (
    <Card className="p-6">
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Beheerders</h2>
          <p className="text-sm text-muted-foreground">Accounts met volledige toegang tot het beheer.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> Beheerder toevoegen</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nieuwe beheerder</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="admin-email">E-mailadres</Label>
                <Input id="admin-email" type="email" autoComplete="email" maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="admin-password">Tijdelijk wachtwoord</Label>
                <Input id="admin-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Minimaal 12 tekens. Deel dit veilig met de nieuwe beheerder.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
              <Button onClick={() => createM.mutate()} disabled={createM.isPending || !email.trim() || password.length < 12}>
                {createM.isPending ? "Aanmaken..." : "Beheerder aanmaken"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {administratorsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : administrators.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen beheerders gevonden.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>E-mailadres</TableHead><TableHead>Aangemaakt</TableHead></TableRow></TableHeader>
          <TableBody>{administrators.map((administrator) => (
            <TableRow key={administrator.id}>
              <TableCell className="font-medium">{administrator.email}</TableCell>
              <TableCell>{new Date(administrator.created_at).toLocaleDateString("nl-BE")}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
    </Card>
  );
}

function StaffPanel({ employees, loading }: { employees: Employee[]; loading: boolean }) {
  const qc = useQueryClient();
  const create = useServerFn(createEmployee);
  const update = useServerFn(updateEmployee);
  const remove = useServerFn(deleteEmployee);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const createMut = useMutation({
    mutationFn: async () => create({ data: { name, pin } }),
    onSuccess: () => {
      toast.success("Personeelslid toegevoegd");
      setOpen(false);
      setName("");
      setPin("");
      qc.invalidateQueries({ queryKey: ["tikklok:employees"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Mislukt"),
  });

  const updateMut = useMutation({
    mutationFn: async (vars: { id: string; name?: string; pin?: string; active?: boolean }) =>
      update({ data: vars }),
    onSuccess: () => {
      toast.success("Bijgewerkt");
      qc.invalidateQueries({ queryKey: ["tikklok:employees"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Mislukt"),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Verwijderd");
      qc.invalidateQueries({ queryKey: ["tikklok:employees"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Mislukt"),
  });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Personeel</h2>
          <p className="text-sm text-muted-foreground">Beheer accounts en PIN-codes.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nieuw personeelslid</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuw personeelslid</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="n">Naam</Label>
                <Input id="n" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="p">PIN (4-8 cijfers)</Label>
                <Input
                  id="p"
                  inputMode="numeric"
                  pattern="\d*"
                  minLength={4}
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? "Bezig..." : "Aanmaken"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden...</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nog geen personeelsleden. Voeg er een toe om te beginnen.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Actief</TableHead>
              <TableHead className="text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((emp) => (
              <EmployeeRow
                key={emp.id}
                emp={emp}
                onUpdate={(patch) => updateMut.mutate({ id: emp.id, ...patch })}
                onDelete={() => removeMut.mutate(emp.id)}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function EmployeeRow({
  emp,
  onUpdate,
  onDelete,
}: {
  emp: Employee;
  onUpdate: (patch: { name?: string; pin?: string; active?: boolean }) => void;
  onDelete: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(emp.name);
  const [pin, setPin] = useState("");

  return (
    <TableRow>
      <TableCell className="font-medium">{emp.name}</TableCell>
      <TableCell>
        <Switch
          checked={emp.active}
          onCheckedChange={(v) => onUpdate({ active: v })}
        />
      </TableCell>
      <TableCell className="text-right space-x-1">
        <QuickIncidentButton employee={emp} />
        <EmployeeDossierDialog employee={emp} />
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Bewerken</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Naam</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Nieuwe PIN</Label>
                <Input
                  inputMode="numeric"
                  pattern="\d*"
                  minLength={4}
                  maxLength={8}
                  placeholder="Leeg laten om te behouden"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => { onUpdate({ name, ...(pin ? { pin } : {}) }); setPin(""); setEditOpen(false); }}>
                Opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                {emp.name} en alle bijbehorende werktijden worden permanent verwijderd.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Verwijderen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

const emptyProfile = {
  email: "", phone: "", street_address: "", postal_code: "", city: "", country: "België", birth_date: "",
  birth_place: "", national_number: "", iban: "", job_category: "", job_tasks: "", joint_committee: "",
  emergency_contact_name: "", emergency_contact_phone: "", job_title: "", department: "", employment_start_date: "",
  contract_type: "", weekly_hours: "", employment_status: "active", monthly_report_enabled: false, split_special_hours: false,
  is_contractor: false, day_hourly_rate: "", special_hourly_rate: "",
  overtime_calculation_mode: "daily", hours_effective_from: "", salary_advances: "", salary_settlement_day: "1",
  schedule_mon: "", schedule_tue: "", schedule_wed: "", schedule_thu: "", schedule_fri: "", schedule_sat: "", schedule_sun: "",
};

const scheduleFields = [
  ["schedule_mon", "Maandag"], ["schedule_tue", "Dinsdag"], ["schedule_wed", "Woensdag"],
  ["schedule_thu", "Donderdag"], ["schedule_fri", "Vrijdag"], ["schedule_sat", "Zaterdag"], ["schedule_sun", "Zondag"],
] as const;

function EmployeeDossierDialog({ employee }: { employee: Employee }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Record<string, string | boolean>>(emptyProfile);
  const [absence, setAbsence] = useState({ absence_type: "vacation", starts_on: "", ends_on: "", notes: "" });
  const [note, setNote] = useState({ title: "", content: "" });
  const getDossier = useServerFn(getEmployeeDossier);
  const saveProfile = useServerFn(saveEmployeeProfile);
  const addAbsence = useServerFn(addEmployeeAbsence);
  const addNote = useServerFn(addEmployeeNote);
  const registerDocument = useServerFn(registerEmployeeDocument);
  const dossierQ = useQuery({
    queryKey: ["tikklok:employeeDossier", employee.id],
    queryFn: () => getDossier({ data: { employeeId: employee.id } }),
    enabled: open,
  });

  useEffect(() => {
    if (!dossierQ.data?.profile) return;
    const next = { ...emptyProfile } as Record<string, string | boolean>;
    for (const key of Object.keys(emptyProfile).filter((field) => !field.startsWith("schedule_"))) {
      const value = dossierQ.data.profile[key as keyof typeof dossierQ.data.profile];
      next[key] = typeof value === "boolean" ? value : value == null ? "" : String(value);
    }
    next['salary_advances'] = formatSalaryAdvances((dossierQ.data.profile as any)['salary_advances']);
    const schedule = dossierQ.data.profile.daily_schedule;
    if (schedule && typeof schedule === "object" && !Array.isArray(schedule)) {
      const values = schedule as Record<string, unknown>;
      for (const [field, day] of [["schedule_mon", "mon"], ["schedule_tue", "tue"], ["schedule_wed", "wed"], ["schedule_thu", "thu"], ["schedule_fri", "fri"], ["schedule_sat", "sat"], ["schedule_sun", "sun"]] as const) {
        next[field] = values[day] == null ? "" : String(values[day]);
      }
    }
    setProfile(next);
  }, [dossierQ.data]);

  const refresh = () => dossierQ.refetch();
  const saveM = useMutation({ mutationFn: () => saveProfile({ data: { employee_id: employee.id, ...profile } }), onSuccess: () => { toast.success("Dossier opgeslagen"); refresh(); }, onError: (e: any) => toast.error(e?.message ?? "Opslaan mislukt") });
  const absenceM = useMutation({ mutationFn: () => addAbsence({ data: { employee_id: employee.id, ...absence } }), onSuccess: () => { toast.success("Afwezigheid toegevoegd"); setAbsence({ absence_type: "vacation", starts_on: "", ends_on: "", notes: "" }); refresh(); }, onError: (e: any) => toast.error(e?.message ?? "Toevoegen mislukt") });
  const noteM = useMutation({ mutationFn: () => addNote({ data: { employee_id: employee.id, ...note } }), onSuccess: () => { toast.success("Notitie toegevoegd"); setNote({ title: "", content: "" }); refresh(); }, onError: (e: any) => toast.error(e?.message ?? "Toevoegen mislukt") });

  const setField = (key: string, value: string | boolean) => setProfile((p) => ({ ...p, [key]: value }));
  const fields = [
    ["email", "E-mail", "email"], ["phone", "Telefoon", "tel"], ["birth_date", "Geboortedatum", "date"],
    ["birth_place", "Geboorteplaats", "text"], ["national_number", "Rijksregisternummer", "text"],
    ["street_address", "Adres", "text"], ["postal_code", "Postcode", "text"], ["city", "Gemeente", "text"], ["country", "Land", "text"],
    ["iban", "Rekeningnummer (IBAN)", "text"],
    ["emergency_contact_name", "Noodcontact", "text"], ["emergency_contact_phone", "Telefoon noodcontact", "tel"],
    ["job_title", "Functie", "text"], ["job_category", "Beroepscategorie", "text"],
    ["joint_committee", "Paritair comité", "text"],
    ["department", "Afdeling", "text"], ["employment_start_date", "Startdatum", "date"],
    ["contract_type", "Contracttype", "text"], ["weekly_hours", "Uren per week", "number"],
  ] as const;
  const scheduleTotal = scheduleFields.reduce((sum, [key]) => sum + (Number(String(profile[key] ?? "").replace(",", ".")) || 0), 0);
  const weeklyHours = Number(String(profile['weekly_hours'] ?? "").replace(",", "."));
  const hasScheduleValues = scheduleFields.some(([key]) => String(profile[key] ?? "").trim() !== "");
  const scheduleMatches = !hasScheduleValues || !Number.isFinite(weeklyHours) || Math.abs(scheduleTotal - weeklyHours) < 0.01;

  async function uploadDocument(file: File) {
    if (file.size > 20 * 1024 * 1024) { toast.error("Document mag maximaal 20 MB zijn"); return; }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${employee.id}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from("tikklok-documents").upload(path, file);
    if (error) { toast.error("Upload mislukt"); return; }
    try {
      await registerDocument({ data: { employee_id: employee.id, title: file.name, document_type: "other", storage_path: path, file_name: file.name, mime_type: file.type || "application/octet-stream", file_size: file.size } });
      toast.success("Document toegevoegd"); refresh();
    } catch (error) { await supabase.storage.from("tikklok-documents").remove([path]); toast.error(error instanceof Error ? error.message : "Registratie mislukt"); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" variant="ghost" aria-label="Personeelsdossier"><FolderOpen className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Personeelsdossier — {employee.name}</DialogTitle></DialogHeader>
        <Tabs defaultValue="profile">
          <TabsList className="flex-wrap h-auto"><TabsTrigger value="profile">Profiel</TabsTrigger><TabsTrigger value="payroll">Loon</TabsTrigger><TabsTrigger value="incidents">Vaststellingen</TabsTrigger><TabsTrigger value="absence">Afwezigheid</TabsTrigger><TabsTrigger value="documents">Documenten</TabsTrigger><TabsTrigger value="notes">Notities</TabsTrigger></TabsList>
          <TabsContent value="payroll"><DossierPayroll employeeId={employee.id} /></TabsContent>
          <TabsContent value="incidents"><IncidentsPanel employees={[employee]} employee={employee} /></TabsContent>
          <TabsContent value="profile" className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">{fields.map(([key, label, type]) => <div key={key}><Label>{label}</Label><Input type={type} list={key === "job_category" ? "job-category-options" : undefined} placeholder={key === "job_category" ? "bv. 1A – gewone schoonmaak" : undefined} value={String(profile[key] ?? "")} onChange={(e) => setField(key, e.target.value)} /></div>)}</div>
            <datalist id="job-category-options">
              {["1A – gewone schoonmaak", "1B – gewone schoonmaak (zware)", "2A – gespecialiseerde schoonmaak", "3A – industriële schoonmaak", "4A – ploegbaas", "5A – meestergast"].map((o) => <option key={o} value={o} />)}
            </datalist>
            <div className="grid sm:grid-cols-[1fr_180px] gap-3 border-t border-border/60 pt-4">
              <div><Label>Loonvoorschotten (dag: bedrag)</Label><Input placeholder="bv. 10: 500; 20: 500" value={String(profile['salary_advances'] ?? "")} onChange={(e) => setField("salary_advances", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Leeg laten als er geen voorschotten zijn. Komt automatisch in nieuwe contracten.</p></div>
              <div><Label>Afrekening op dag</Label><Input inputMode="numeric" value={String(profile['salary_settlement_day'] ?? "1")} onChange={(e) => setField("salary_settlement_day", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">van de volgende maand</p></div>
            </div>
            <div className="space-y-3 border-y border-border/60 py-4">
              <div><Label>Berekening overuren</Label><Select value={String(profile['overtime_calculation_mode'] ?? "daily")} onValueChange={(value) => setField("overtime_calculation_mode", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Volgens uren per dag</SelectItem><SelectItem value="weekly">Enkel volgens uren per week (variabel rooster)</SelectItem></SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Bij een variabel rooster telt alleen het totaal van de afgesloten week. Minder uren op één dag geven dan geen apart tekort.</p></div>
              <div><Label>Persoonlijk weekrooster</Label><p className="text-xs text-muted-foreground">Vul de contracturen per dag in. Laat alles leeg om de weekuren gelijk over maandag tot vrijdag te verdelen.</p></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{scheduleFields.map(([key, label]) => <div key={key}><Label htmlFor={`${key}-${employee.id}`}>{label}</Label><Input id={`${key}-${employee.id}`} type="text" inputMode="decimal" placeholder="0" value={String(profile[key] ?? "")} onChange={(e) => setField(key, e.target.value)} /></div>)}</div>
              <p className={`text-sm font-medium ${scheduleMatches ? "text-muted-foreground" : "text-destructive"}`}>{hasScheduleValues ? `Totaal rooster: ${scheduleTotal.toLocaleString("nl-BE")} u${Number.isFinite(weeklyHours) ? ` van ${weeklyHours.toLocaleString("nl-BE")} u/week` : ""}` : `Standaardverdeling: ${Number.isFinite(weeklyHours) ? `${(weeklyHours / 5).toLocaleString("nl-BE", { maximumFractionDigits: 2 })} u per werkdag` : "vul eerst de weekuren in"}`}</p>
              <div><Label htmlFor={`hours-effective-${employee.id}`}>Ingangsdatum bij gewijzigde uren</Label><Input id={`hours-effective-${employee.id}`} type="date" value={String(profile['hours_effective_from'] ?? "")} onChange={(e) => setField("hours_effective_from", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Enkel invullen als je de weekuren of het rooster wijzigt: weken vóór deze datum blijven met de oude uren rekenen. Leeg laten = vanaf vandaag.</p></div>
            </div>
            <div><Label>Taken (komt in het contract)</Label><Textarea rows={3} value={String(profile['job_tasks'] ?? "")} onChange={(e) => setField("job_tasks", e.target.value)} /></div>
            <div className="flex items-center justify-between rounded-md border p-3"><div><Label>Maandelijks rapport mailen</Label><p className="text-xs text-muted-foreground">Op de eerste dag, naar het e-mailadres hierboven.</p></div><Switch checked={Boolean(profile['monthly_report_enabled'])} onCheckedChange={(v) => setField("monthly_report_enabled", v)} /></div>
            <div className="flex items-center justify-between rounded-md border p-3"><div><Label>Dag- en avond/weekenduren opsplitsen</Label><p className="text-xs text-muted-foreground">Weekdagen vanaf 18u en alle weekenduren worden apart geteld.</p></div><Switch checked={Boolean(profile['split_special_hours'])} onCheckedChange={(v) => setField("split_special_hours", v)} /></div>
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-4"><div><Label>Onderaannemer</Label><p className="text-xs text-muted-foreground">Bereken in de adminzone het bedrag dat deze persoon kan factureren.</p></div><Switch checked={Boolean(profile['is_contractor'])} onCheckedChange={(v) => setField("is_contractor", v)} /></div>
              {Boolean(profile['is_contractor']) && <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor={`day-rate-${employee.id}`}>Uurloon overdag (€)</Label><Input id={`day-rate-${employee.id}`} type="number" min="0" max="10000" step="0.01" inputMode="decimal" value={String(profile['day_hourly_rate'] ?? "")} onChange={(e) => setField("day_hourly_rate", e.target.value)} /></div>
                <div><Label htmlFor={`special-rate-${employee.id}`}>Uurloon na 18u/weekend (€)</Label><Input id={`special-rate-${employee.id}`} type="number" min="0" max="10000" step="0.01" inputMode="decimal" value={String(profile['special_hourly_rate'] ?? "")} onChange={(e) => setField("special_hourly_rate", e.target.value)} /></div>
              </div>}
            </div>
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>Dossier opslaan</Button>
          </TabsContent>
          <TabsContent value="absence" className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3"><Select value={absence.absence_type} onValueChange={(v) => setAbsence((a) => ({ ...a, absence_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vacation">Verlof</SelectItem><SelectItem value="sick">Ziekte</SelectItem><SelectItem value="unpaid">Onbetaald</SelectItem><SelectItem value="other">Andere</SelectItem></SelectContent></Select><Input type="date" value={absence.starts_on} onChange={(e) => setAbsence((a) => ({ ...a, starts_on: e.target.value }))} /><Input type="date" value={absence.ends_on} onChange={(e) => setAbsence((a) => ({ ...a, ends_on: e.target.value }))} /></div>
            <Textarea placeholder="Toelichting" value={absence.notes} onChange={(e) => setAbsence((a) => ({ ...a, notes: e.target.value }))} /><Button onClick={() => absenceM.mutate()}>Toevoegen</Button>
            {(dossierQ.data?.absences ?? []).map((a) => <div key={a.id} className="border-t pt-3 text-sm"><strong>{a.absence_type}</strong> · {a.starts_on} t/m {a.ends_on}{a.notes ? ` — ${a.notes}` : ""}</div>)}
          </TabsContent>
          <TabsContent value="documents" className="space-y-4"><Label className="inline-flex items-center gap-2 cursor-pointer"><Button asChild variant="outline"><span><Upload /> Document uploaden</span></Button><Input className="hidden" type="file" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadDocument(file); }} /></Label>{(dossierQ.data?.documents ?? []).map((d) => <div key={d.id} className="border-t pt-3 text-sm">{d.title} <span className="text-muted-foreground">({Math.round(d.file_size / 1024)} KB)</span></div>)}</TabsContent>
          <TabsContent value="notes" className="space-y-3"><Input placeholder="Titel" value={note.title} onChange={(e) => setNote((n) => ({ ...n, title: e.target.value }))} /><Textarea placeholder="Vertrouwelijke notitie" value={note.content} onChange={(e) => setNote((n) => ({ ...n, content: e.target.value }))} /><Button onClick={() => noteM.mutate()}>Notitie toevoegen</Button>{(dossierQ.data?.notes ?? []).map((n) => <div key={n.id} className="border-t pt-3"><strong>{n.title}</strong><p className="text-sm whitespace-pre-wrap">{n.content}</p></div>)}</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function todayISO() {
  const d = new Date();
  return localDateISO(d);
}
function firstDayOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return localDateISO(d);
}
function localDateISO(d: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(mins: number | null) {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}u ${m.toString().padStart(2, "0")}m`;
}
function fmtMoney(amount: number | null) {
  return amount == null ? "—" : new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(amount);
}

function LivePanel() {
  const fetchLive = useServerFn(getLiveStatus);
  const liveQ = useQuery({
    queryKey: ["tikklok:liveStatus"],
    queryFn: () => fetchLive({}),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const rows: LiveStatusRow[] = liveQ.data ?? [];
  const active = rows.filter((r) => r.active);
  const inCount = active.filter((r) => r.clocked_in).length;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
              </span>
              Live status
            </h2>
            <p className="text-sm text-muted-foreground">
              {inCount} van {active.length} ingetikt · ververst elke 5 sec.
            </p>
          </div>
        </div>

        {liveQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nog geen personeel.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sinds</TableHead>
                <TableHead className="text-right">Vandaag gewerkt</TableHead>
                <TableHead className="text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employee_id} className={!r.active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{r.employee_name}</TableCell>
                  <TableCell>
                    {r.clocked_in ? (
                      <span className="inline-flex items-center gap-1.5 text-primary font-medium">
                        <CircleDot className="h-3.5 w-3.5" /> Ingetikt
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Uitgetikt</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {r.since ? fmtTime(r.since) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtDuration(r.today_minutes)}</TableCell>
                  <TableCell className="text-right">
                    {r.clocked_in && r.since && <EndTimeButton row={r} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function EndTimeButton({ row }: { row: LiveStatusRow }) {
  const qc = useQueryClient();
  const fetchReport = useServerFn(getReport);
  const doUpdate = useServerFn(updateTimeEntry);
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<ReportRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [endTime, setEndTime] = useState("");

  async function showDialog() {
    if (!row.since) return;
    setOpen(true);
    setLoading(true);
    setError("");
    setEntry(null);
    setEndTime(toLocalInput(new Date().toISOString()));
    try {
      const entries = await fetchReport({ data: { from: row.since, to: new Date().toISOString() } });
      const current = entries.find(e => e.employee_id === row.employee_id && e.clock_out === null && e.clock_in === row.since);
      if (!current) throw new Error("Deze medewerker is inmiddels uitgetikt. Vernieuw het overzicht.");
      setEntry(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registratie ophalen mislukt");
    } finally {
      setLoading(false);
    }
  }

  const saveM = useMutation({
    mutationFn: async () => {
      if (!entry || !endTime) throw new Error("Vul de eindtijd in");
      return doUpdate({ data: { id: entry.entry_id, clock_in: entry.clock_in, clock_out: fromLocalInput(endTime) } });
    },
    onSuccess: () => {
      toast.success(`${row.employee_name} uitgetikt`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["tikklok:liveStatus"] });
      qc.invalidateQueries({ queryKey: ["tikklok:report"] });
    },
    onError: (e) => toast.error(e.message || "Uittikken mislukt"),
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!saveM.isPending) setOpen(value); }}>
      <Button variant="outline" size="sm" onClick={showDialog} aria-label={`Eindtijd ingeven voor ${row.employee_name}`}>
        <LogOut className="h-4 w-4 mr-1" /> Eindtijd ingeven
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Eindtijd ingeven — {row.employee_name}</DialogTitle></DialogHeader>
        {loading ? <p className="text-sm text-muted-foreground">Registratie ophalen...</p> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : entry && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ingetikt op {fmtDate(entry.clock_in)} om {fmtTime(entry.clock_in)}</p>
            <div>
              <Label htmlFor={`end-time-${row.employee_id}`}>Einddatum en eindtijd</Label>
              <Input id={`end-time-${row.employee_id}`} type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saveM.isPending} onClick={() => setOpen(false)}>Annuleren</Button>
          <Button disabled={loading || !entry || !endTime || saveM.isPending} onClick={() => saveM.mutate()}>
            <LogOut className="h-4 w-4 mr-1" /> {saveM.isPending ? "Opslaan..." : "Uittikken en opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportsPanel({ employees }: { employees: Employee[] }) {
  const qc = useQueryClient();
  const fetchReport = useServerFn(getReport);
  const createManualEntry = useServerFn(createManualTimeEntry);
  const [from, setFrom] = useState(firstDayOfMonthISO);
  const [to, setTo] = useState(todayISO());
  const [grouping, setGrouping] = useState<"day" | "week" | "month" | "person">("person");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualEmployee, setManualEmployee] = useState("");
  const [manualClockIn, setManualClockIn] = useState("");
  const [manualClockOut, setManualClockOut] = useState("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const reportQ = useQuery({
    queryKey: ["tikklok:report", from, to],
    queryFn: () =>
      fetchReport({
        data: {
          from: new Date(from + "T00:00:00").toISOString(),
          to: new Date(to + "T23:59:59").toISOString(),
        },
      }),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const allRows = reportQ.data ?? [];
  const rows = useMemo(
    () => (employeeFilter === "all" ? allRows : allRows.filter((r) => r.employee_id === employeeFilter)),
    [allRows, employeeFilter],
  );

  const grouped = useMemo(() => groupRows(rows, grouping), [rows, grouping]);

  const manualM = useMutation({
    mutationFn: () => createManualEntry({
      data: {
        employee_id: manualEmployee,
        clock_in: fromLocalInput(manualClockIn),
        clock_out: fromLocalInput(manualClockOut),
      },
    }),
    onSuccess: () => {
      const entryDate = manualClockIn.slice(0, 10);
      const selectedEmployee = manualEmployee;
      toast.success("Uren handmatig toegevoegd");
      setManualOpen(false);
      if (entryDate < from) setFrom(entryDate);
      if (entryDate > to) setTo(entryDate);
      setEmployeeFilter(selectedEmployee);
      setManualEmployee("");
      setManualClockIn("");
      setManualClockOut("");
      qc.invalidateQueries({ queryKey: ["tikklok:report"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Uren toevoegen mislukt"),
  });

  function exportCSV() {
    const header = ["Naam", "Datum", "Inkloktijd", "Uitkloktijd", "Minuten", "Uren", "Daguren", "Na 18u/weekend", "Dagtarief", "Avond/weekendtarief", "Te factureren"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          csvEscape(r.employee_name),
          fmtDate(r.clock_in),
          fmtTime(r.clock_in),
          r.clock_out ? fmtTime(r.clock_out) : "",
          r.minutes ?? "",
          r.minutes != null ? (r.minutes / 60).toFixed(2) : "",
          r['split_special_hours'] && r.day_minutes != null ? (r.day_minutes / 60).toFixed(2) : "",
          r['split_special_hours'] && r.special_minutes != null ? (r.special_minutes / 60).toFixed(2) : "",
          r['is_contractor'] && r['day_hourly_rate'] != null ? r['day_hourly_rate'].toFixed(2) : "",
          r['is_contractor'] && r['special_hourly_rate'] != null ? r['special_hourly_rate'].toFixed(2) : "",
          r['is_contractor'] && r.invoice_amount != null ? r.invoice_amount.toFixed(2) : "",
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const who =
      employeeFilter === "all"
        ? "alle"
        : (employees.find((e) => e.id === employeeFilter)?.name ?? "personeel").replace(/\s+/g, "-").toLowerCase();
    a.download = `tikklok-${who}-${from}-tot-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    setIsExportingPdf(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const orange = rgb(0.95, 0.35, 0.08);
      const dark = rgb(0.08, 0.08, 0.08);
      const muted = rgb(0.42, 0.42, 0.42);
      const border = rgb(0.84, 0.84, 0.84);
      const safeText = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[–—]/g, "-")
          .replace(/[^\x20-\x7E]/g, "?");
      const selectedName =
        employeeFilter === "all"
          ? "Alle personeelsleden"
          : employees.find((employee) => employee.id === employeeFilter)?.name ?? "Personeelslid";
      let page = pdf.addPage([595.28, 841.89]);
      let y = 792;

      const drawPageHeader = (continued = false) => {
        page.drawText("RIORY", { x: 40, y, size: 19, font: bold, color: orange });
        page.drawText(continued ? "URENRAPPORT - VERVOLG" : "URENRAPPORT", {
          x: 40,
          y: y - 27,
          size: 16,
          font: bold,
          color: dark,
        });
        page.drawText(safeText(`${selectedName} | ${from} tot ${to}`), {
          x: 40,
          y: y - 47,
          size: 9,
          font: regular,
          color: muted,
        });
        page.drawLine({ start: { x: 40, y: y - 61 }, end: { x: 555, y: y - 61 }, thickness: 1, color: orange });
        y -= 84;
      };
      const newPage = () => {
        page = pdf.addPage([595.28, 841.89]);
        y = 792;
        drawPageHeader(true);
      };
      const ensureSpace = (height: number) => {
        if (y - height < 42) newPage();
      };
      const drawTableHeader = () => {
        ensureSpace(28);
        page.drawText("Naam", { x: 40, y, size: 8, font: bold, color: dark });
        page.drawText("Datum", { x: 178, y, size: 8, font: bold, color: dark });
        page.drawText("In", { x: 260, y, size: 8, font: bold, color: dark });
        page.drawText("Uit", { x: 305, y, size: 8, font: bold, color: dark });
        page.drawText("Duur", { x: 360, y, size: 8, font: bold, color: dark });
        page.drawText("Overdag", { x: 423, y, size: 8, font: bold, color: dark });
        page.drawText("Na 18u/weekend", { x: 485, y, size: 8, font: bold, color: dark });
        y -= 14;
        page.drawLine({ start: { x: 40, y: y + 5 }, end: { x: 555, y: y + 5 }, thickness: 0.6, color: border });
      };

      drawPageHeader();
      const totalMinutes = rows.reduce((sum, row) => sum + (row.minutes ?? 0), 0);
      const dayMinutes = rows.reduce((sum, row) => sum + (row.day_minutes ?? 0), 0);
      const specialMinutes = rows.reduce((sum, row) => sum + (row.special_minutes ?? 0), 0);
      const hasSplit = rows.some((row) => row['split_special_hours']);
      const invoiceTotal = rows.reduce((sum, row) => sum + (row.invoice_amount ?? 0), 0);
      const hasContractors = rows.some((row) => row['is_contractor']);
      page.drawText(`Totaal: ${fmtDuration(totalMinutes)}`, { x: 40, y, size: 13, font: bold, color: orange });
      page.drawText(`Registraties: ${rows.length}`, { x: 220, y, size: 10, font: regular, color: dark });
      if (hasSplit) {
        page.drawText(`Overdag: ${fmtDuration(dayMinutes)}`, { x: 340, y, size: 10, font: regular, color: dark });
        page.drawText(`Na 18u/weekend: ${fmtDuration(specialMinutes)}`, { x: 40, y: y - 20, size: 10, font: regular, color: dark });
        y -= 20;
      }
      if (hasContractors) {
        page.drawText(safeText(`Te factureren: ${fmtMoney(invoiceTotal)}`), { x: 220, y: y - 20, size: 10, font: bold, color: orange });
        y -= 20;
      }
      y -= 30;
      drawTableHeader();
      for (const row of rows) {
        if (y < 58) {
          newPage();
          drawTableHeader();
        }
        page.drawText(safeText(row.employee_name).slice(0, 25), { x: 40, y, size: 8, font: regular, color: dark });
        page.drawText(fmtDate(row.clock_in), { x: 178, y, size: 8, font: regular, color: dark });
        page.drawText(fmtTime(row.clock_in), { x: 260, y, size: 8, font: regular, color: dark });
        page.drawText(row.clock_out ? fmtTime(row.clock_out) : "bezig", { x: 305, y, size: 8, font: regular, color: row.clock_out ? dark : orange });
        page.drawText(fmtDuration(row.minutes), { x: 360, y, size: 8, font: regular, color: dark });
        page.drawText(row['split_special_hours'] ? fmtDuration(row.day_minutes) : "-", { x: 423, y, size: 8, font: regular, color: dark });
        page.drawText(row['split_special_hours'] ? fmtDuration(row.special_minutes) : "-", { x: 485, y, size: 8, font: regular, color: dark });
        y -= 18;
        page.drawLine({ start: { x: 40, y: y + 6 }, end: { x: 555, y: y + 6 }, thickness: 0.35, color: border });
      }
      const bytes = await pdf.save();
      const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const who = safeText(selectedName).replace(/\s+/g, "-").toLowerCase();
      anchor.href = url;
      anchor.download = `tikklok-${who}-${from}-tot-${to}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("PDF geëxporteerd");
    } catch (error) {
      console.error("PDF export failed", error);
      toast.error("PDF exporteren mislukt");
    } finally {
      setIsExportingPdf(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Rapport</h2>
            <p className="text-sm text-muted-foreground">Bekijk, corrigeer of voeg gewerkte uren toe.</p>
          </div>
          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button disabled={employees.length === 0}><Plus className="mr-1 h-4 w-4" /> Uren toevoegen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Uren handmatig toevoegen</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="manual-employee">Personeelslid</Label>
                  <Select value={manualEmployee} onValueChange={setManualEmployee}>
                    <SelectTrigger id="manual-employee"><SelectValue placeholder="Kies een personeelslid" /></SelectTrigger>
                    <SelectContent>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="manual-start">Starttijd</Label>
                  <Input id="manual-start" type="datetime-local" value={manualClockIn} onChange={(e) => setManualClockIn(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="manual-end">Eindtijd</Label>
                  <Input id="manual-end" type="datetime-local" value={manualClockOut} onChange={(e) => setManualClockOut(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setManualOpen(false)}>Annuleren</Button>
                <Button onClick={() => manualM.mutate()} disabled={manualM.isPending || !manualEmployee || !manualClockIn || !manualClockOut}>
                  {manualM.isPending ? "Toevoegen..." : "Uren toevoegen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="from">Van</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">Tot</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="min-w-[200px]">
            <Label>Personeelslid</Label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Iedereen</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1">
            {(["person", "day", "week", "month"] as const).map((g) => (
              <Button
                key={g}
                variant={grouping === g ? "default" : "outline"}
                size="sm"
                onClick={() => setGrouping(g)}
              >
                {g === "person" ? "Per persoon" : g === "day" ? "Per dag" : g === "week" ? "Per week" : "Per maand"}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => reportQ.refetch()} disabled={reportQ.isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1 ${reportQ.isFetching ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
          <Button variant="secondary" onClick={exportCSV} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" />
            {employeeFilter === "all" ? "Export CSV" : "Export deze persoon"}
          </Button>
          <Button variant="secondary" onClick={exportPDF} disabled={!rows.length || isExportingPdf}>
            <FileText className="h-4 w-4 mr-1" />
            {isExportingPdf ? "PDF maken..." : "Export PDF"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-3">Samenvatting</h3>
        {reportQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen registraties in deze periode.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{grouping === "person" ? "Personeelslid" : "Periode"}</TableHead>
                  {grouping !== "person" && <TableHead>Personeelslid</TableHead>}
                  <TableHead className="text-right">Totale tijd</TableHead>
                  <TableHead className="text-right">Overdag</TableHead>
                  <TableHead className="text-right">Na 18u/weekend</TableHead>
                  <TableHead className="text-right">Te factureren</TableHead>
                  <TableHead className="text-right">Sessies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((g) => (
                  <TableRow key={g.key}>
                    <TableCell className="font-medium">{g.label}</TableCell>
                    {grouping !== "person" && <TableCell>{g.person}</TableCell>}
                    <TableCell className="text-right font-mono">{fmtDuration(g.minutes)}</TableCell>
                    <TableCell className="text-right font-mono">{g.hasSplit ? fmtDuration(g.dayMinutes) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{g.hasSplit ? fmtDuration(g.specialMinutes) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{g.isContractor ? fmtMoney(g.invoiceAmount) : "—"}</TableCell>
                    <TableCell className="text-right">{g.count}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-semibold bg-muted/30">
                  <TableCell>Totaal</TableCell>
                  {grouping !== "person" && <TableCell />}
                  <TableCell className="text-right font-mono">
                    {fmtDuration(grouped.reduce((sum, g) => sum + g.minutes, 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono">{grouped.some((g) => g.hasSplit) ? fmtDuration(grouped.reduce((sum, g) => sum + g.dayMinutes, 0)) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{grouped.some((g) => g.hasSplit) ? fmtDuration(grouped.reduce((sum, g) => sum + g.specialMinutes, 0)) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{grouped.some((g) => g.isContractor) ? fmtMoney(grouped.reduce((sum, g) => sum + g.invoiceAmount, 0)) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {grouped.reduce((sum, g) => sum + g.count, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-3">Alle registraties</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen registraties.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Uit</TableHead>
                <TableHead className="text-right">Duur</TableHead>
                <TableHead className="text-right">Overdag</TableHead>
                <TableHead className="text-right">Na 18u/weekend</TableHead>
                <TableHead className="text-right">Te factureren</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.entry_id}>
                  <TableCell className="font-medium">{r.employee_name}</TableCell>
                  <TableCell>{fmtDate(r.clock_in)}</TableCell>
                  <TableCell>{fmtTime(r.clock_in)}</TableCell>
                  <TableCell>{r.clock_out ? fmtTime(r.clock_out) : <span className="text-muted-foreground">bezig</span>}</TableCell>
                  <TableCell className="text-right font-mono">{fmtDuration(r.minutes)}</TableCell>
                  <TableCell className="text-right font-mono">{r['split_special_hours'] ? fmtDuration(r.day_minutes) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r['split_special_hours'] ? fmtDuration(r.special_minutes) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r['is_contractor'] ? fmtMoney(r.invoice_amount) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <EntryActions row={r} onChanged={() => reportQ.refetch()} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string) {
  return new Date(v).toISOString();
}

function EntryActions({ row, onChanged }: { row: ReportRow; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [clockIn, setClockIn] = useState(toLocalInput(row.clock_in));
  const [clockOut, setClockOut] = useState(toLocalInput(row.clock_out));
  const doUpdate = useServerFn(updateTimeEntry);
  const doDelete = useServerFn(deleteTimeEntry);

  const updateM = useMutation({
    mutationFn: () =>
      doUpdate({
        data: {
          id: row.entry_id,
          clock_in: fromLocalInput(clockIn),
          clock_out: clockOut ? fromLocalInput(clockOut) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Registratie bijgewerkt");
      setOpen(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Bijwerken mislukt"),
  });

  const deleteM = useMutation({
    mutationFn: () => doDelete({ data: { id: row.entry_id } }),
    onSuccess: () => {
      toast.success("Registratie verwijderd");
      setDelOpen(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Verwijderen mislukt"),
  });

  return (
    <div className="flex justify-end gap-1">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setClockIn(toLocalInput(row.clock_in)); setClockOut(toLocalInput(row.clock_out)); } }}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Bewerken">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registratie bewerken — {row.employee_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ein">Inkloktijd</Label>
              <Input id="ein" type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="eout">Uitkloktijd</Label>
              <Input id="eout" type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Leeg laten = nog bezig</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={() => updateM.mutate()} disabled={updateM.isPending || !clockIn}>
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Verwijderen">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registratie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {row.employee_name} — {fmtDate(row.clock_in)} {fmtTime(row.clock_in)}
              {row.clock_out ? ` – ${fmtTime(row.clock_out)}` : ""}. Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); deleteM.mutate(); }} disabled={deleteM.isPending}>
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function csvEscape(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function groupRows(rows: ReportRow[], mode: "day" | "week" | "month" | "person") {
  const map = new Map<string, { key: string; label: string; person: string; minutes: number; dayMinutes: number; specialMinutes: number; hasSplit: boolean; isContractor: boolean; invoiceAmount: number; count: number }>();
  for (const r of rows) {
    const date = new Date(r.clock_in);
    let key: string;
    let label: string;
    if (mode === "person") {
      key = r.employee_id;
      label = r.employee_name;
    } else if (mode === "day") {
      key = `${r.employee_id}-${date.toISOString().slice(0, 10)}`;
      label = date.toLocaleDateString("nl-NL", { weekday: "short", day: "2-digit", month: "short" });
    } else if (mode === "week") {
      const wk = getWeek(date);
      key = `${r.employee_id}-w${wk.year}-${wk.week}`;
      label = `Week ${wk.week} ${wk.year}`;
    } else {
      key = `${r.employee_id}-${date.getFullYear()}-${date.getMonth()}`;
      label = date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
    }
    const ex = map.get(key) ?? { key, label, person: r.employee_name, minutes: 0, dayMinutes: 0, specialMinutes: 0, hasSplit: false, isContractor: false, invoiceAmount: 0, count: 0 };
    ex.minutes += r.minutes ?? 0;
    ex.dayMinutes += r.day_minutes ?? 0;
    ex.specialMinutes += r.special_minutes ?? 0;
    ex.hasSplit ||= r['split_special_hours'];
    ex.isContractor ||= r['is_contractor'];
    ex.invoiceAmount += r.invoice_amount ?? 0;
    ex.count += 1;
    map.set(key, ex);
  }
  return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
}

function getWeek(d: Date) {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return { week, year: target.getUTCFullYear() };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short" });
}

function RequestsPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listTimeEntryRequests);
  const review = useServerFn(reviewTimeEntryRequest);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});

  const reqQ = useQuery({
    queryKey: ["tikklok:timeEntryRequests", filter],
    queryFn: () => list({ data: { status: filter } }) as Promise<TimeEntryRequestRow[]>,
  });

  const reviewM = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject" }) =>
      review({ data: { id: vars.id, action: vars.action, review_note: reviewNote[vars.id] ?? "" } }),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "approve" ? "Aanvraag goedgekeurd" : "Aanvraag afgewezen");
      qc.invalidateQueries({ queryKey: ["tikklok:timeEntryRequests"] });
      qc.invalidateQueries({ queryKey: ["tikklok:report"] });
      setReviewNote((r) => {
        const n = { ...r };
        delete n[vars.id];
        return n;
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Actie mislukt"),
  });

  const rows = reqQ.data ?? [];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Urenaanvragen</h2>
          <p className="text-sm text-muted-foreground">Handmatig ingediende werkuren wachten hier op je goedkeuring.</p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">In behandeling</SelectItem>
            <SelectItem value="approved">Goedgekeurd</SelectItem>
            <SelectItem value="rejected">Afgewezen</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {reqQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen aanvragen gevonden.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const mins = Math.round((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 60000);
            const hrs = Math.floor(mins / 60);
            const rest = mins % 60;
            return (
              <div key={r.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-medium">{r.employee_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDateTime(r.clock_in)} → {formatDateTime(r.clock_out)} ({hrs}u {rest}m)
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Ingediend {formatDateTime(r.created_at)}</div>
                    {r.note && <div className="text-sm mt-2">"{r.note}"</div>}
                    {r.status !== "pending" && r.review_note && (
                      <div className="text-xs italic mt-2">Reactie: {r.review_note}</div>
                    )}
                  </div>
                  <div className="text-xs uppercase font-semibold">
                    {r.status === "pending" ? "In behandeling" : r.status === "approved" ? "Goedgekeurd" : "Afgewezen"}
                  </div>
                </div>
                {r.status === "pending" && (
                  <div className="mt-3 space-y-2">
                    <Input
                      placeholder="Optionele reactie voor medewerker"
                      value={reviewNote[r.id] ?? ""}
                      onChange={(e) => setReviewNote((n) => ({ ...n, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewM.mutate({ id: r.id, action: "approve" })} disabled={reviewM.isPending}>
                        <Check className="h-4 w-4 mr-1" /> Goedkeuren
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => reviewM.mutate({ id: r.id, action: "reject" })} disabled={reviewM.isPending}>
                        <X className="h-4 w-4 mr-1" /> Afwijzen
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
