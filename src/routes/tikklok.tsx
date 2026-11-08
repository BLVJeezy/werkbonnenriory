import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { LogIn, LogOut, Delete, ShieldCheck, ClipboardList, FileText, CalendarDays } from "lucide-react";
import { clockIn, clockOut, getMyHours, submitTimeEntryRequest, getMyRequests, getMyMessages, acknowledgeMessages, type EmployeeMessage } from "@/lib/tikklok/clock.functions";
import { getMyPayslips } from "@/lib/tikklok/payroll.functions";
import { getDeviceStatus, resolveDevice } from "@/lib/tikklok/device.functions";
import { getMyHrFile, getMyPendingContracts, signMyContract } from "@/lib/tikklok/hr.functions";
import { contractTypeLabel } from "@/lib/tikklok/contract-types";
import { SignaturePad } from "@/components/tikklok/signature-pad";
import { MyHrFile, type HrFile } from "@/components/tikklok/my-hr-file";
import { MyOvertime } from "@/components/tikklok/my-overtime";
import rioryLogo from "@/assets/riory-mail-logo.png.asset.json";
import { ThemeToggle } from "@/components/tikklok/theme-toggle";
import { getMyCalendarNotices, acknowledgeCalendarNotices, getPublicNotices } from "@/lib/tikklok/calendar.functions";
import type { CalendarNotice } from "@/lib/tikklok/calendar-rules";
import { BirthdayFireworks } from "@/components/tikklok/birthday-fireworks";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/tikklok")({
  head: () => ({
    meta: [
      { title: "Tikklok – In- en uittikken" },
      { name: "description", content: "Tik in en uit met je persoonlijke PIN-code." },
      { property: "og:title", content: "Riory Tikklok" },
      { property: "og:description", content: "Tik in en uit en bekijk je persoonlijke werkuren." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClockTerminal,
});

type Status =
  | { kind: "idle" }
  | {
      kind: "success";
      action: "in" | "out";
      name: string;
      time: string;
      clockIn?: string;
    };

const DEVICE_TOKEN_KEY = "riory-integrated-clock-device-token";
type DeviceState = { token: string; status: "pending" | "approved" | "blocked" };
let deviceRegistration: Promise<DeviceState> | null = null;

function getOrRegisterDevice(
  resolve: (options: {
    data: { token: string | null; deviceName: string };
  }) => Promise<DeviceState>,
) {
  if (!deviceRegistration) {
    let savedToken: string | null = null;
    try {
      savedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    } catch {
      savedToken = null;
    }

    deviceRegistration = resolve({
      data: {
        token: savedToken,
        deviceName: `${navigator.platform || "Toestel"} · ${new Date().toLocaleDateString("nl-BE")}`,
      },
    })
      .then((state) => {
        try {
          localStorage.setItem(DEVICE_TOKEN_KEY, state.token);
        } catch {
          /* opslag niet beschikbaar – cookie neemt over */
        }
        return state;
      })
      .catch((error: unknown) => {
        deviceRegistration = null;
        throw error;
      });
  }

  return deviceRegistration;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}u ${m.toString().padStart(2, "0")}m`;
}

function ClockTerminal() {
  const initDevice = useServerFn(resolveDevice);
  const checkDevice = useServerFn(getDeviceStatus);
  const [deviceToken, setDeviceToken] = useState("");
  const [deviceStatus, setDeviceStatus] = useState<"loading" | "pending" | "approved" | "blocked">("loading");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [hours, setHours] = useState<null | {
    name: string;
    entries: { id: string; clock_in: string; clock_out: string | null }[];
  }>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqStart, setReqStart] = useState("");
  const [reqEnd, setReqEnd] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [myRequests, setMyRequests] = useState<null | {
    name: string;
    requests: { id: string; clock_in: string; clock_out: string; note: string | null; status: string; review_note: string | null; reviewed_at: string | null; created_at: string }[];
  }>(null);
  const [myPayslips, setMyPayslips] = useState<null | {
    name: string;
    disclaimer: string;
    payslips: { period_month: string; status: string; worked_minutes: number; gross: number; rsz_employee: number; bv: number; net: number; payable: number; advances: number; banked_overtime_minutes: number }[];
  }>(null);

  const [messages, setMessages] = useState<null | { pin: string; name: string; items: EmployeeMessage[] }>(null);
  const [calendarNotices, setCalendarNotices] = useState<null | { pin: string; items: CalendarNotice[] }>(null);
  const [ackBusy, setAckBusy] = useState(false);
  const [calendarReadKeys, setCalendarReadKeys] = useState<string[]>([]);
  const [messageReadIds, setMessageReadIds] = useState<string[]>([]);
  const fetchCalendarNotices = useServerFn(getMyCalendarNotices);
  const ackCalendarNotices = useServerFn(acknowledgeCalendarNotices);
  const fetchPublicNotices = useServerFn(getPublicNotices);
  const [publicNotices, setPublicNotices] = useState<CalendarNotice[] | null>(null);

  async function confirmCalendarNotices() {
    if (!calendarNotices || ackBusy || !calendarReadKeys.length) return;
    setAckBusy(true);
    try {
      await ackCalendarNotices({ data: { pin: calendarNotices.pin, deviceToken, keys: calendarReadKeys } });
      const remaining = calendarNotices.items.filter(n => !calendarReadKeys.includes(n.key));
      setCalendarNotices(remaining.length ? { ...calendarNotices, items: remaining } : null);
      setCalendarReadKeys([]);
    } catch { toast.error("Melding bevestigen mislukt. Probeer opnieuw."); }
    finally { setAckBusy(false); }
  }

  const [hrFile, setHrFile] = useState<HrFile | null>(null);
  const [sessionPin, setSessionPin] = useState("");
  const [overtimePin, setOvertimePin] = useState("");

  const fetchHrFile = useServerFn(getMyHrFile);
  const fetchPendingContracts = useServerFn(getMyPendingContracts);
  const doSignContract = useServerFn(signMyContract);
  const [pendingSign, setPendingSign] = useState<null | { pin: string; name: string; items: { id: string; contract_type: string; body: string; employer_signature_image?: string | null; employer_signed_name?: string | null; employer_signed_at?: string | null }[] }>(null);
  const [pendingSignName, setPendingSignName] = useState("");
  const [pendingSignBusy, setPendingSignBusy] = useState(false);
  const [pendingSignImage, setPendingSignImage] = useState<string | null>(null);
  async function signPendingContract() {
    if (!pendingSign || pendingSignBusy) return;
    const current = pendingSign.items[0];
    setPendingSignBusy(true);
    try {
      await doSignContract({ data: { pin: pendingSign.pin, deviceToken, id: current.id, fullName: pendingSignName, signatureImage: pendingSignImage ?? "" } });
      setPendingSignImage(null);
      toast.success("Contract ondertekend");
      const rest = pendingSign.items.slice(1);
      setPendingSign(rest.length ? { ...pendingSign, items: rest } : null);
    } catch (e: any) { toast.error(e?.message ?? "Ondertekenen mislukt"); }
    finally { setPendingSignBusy(false); }
  }
  const doClockIn = useServerFn(clockIn);
  const doClockOut = useServerFn(clockOut);
  const fetchHours = useServerFn(getMyHours);
  const submitRequest = useServerFn(submitTimeEntryRequest);
  const fetchRequests = useServerFn(getMyRequests);
  const fetchPayslips = useServerFn(getMyPayslips);
  const fetchMessages = useServerFn(getMyMessages);
  const ackMessages = useServerFn(acknowledgeMessages);

  async function confirmMessages() {
    if (!messages || ackBusy || !messageReadIds.length) return;
    const current = messages;
    setAckBusy(true);
    try {
      await ackMessages({
        data: { pin: current.pin, deviceToken, messageIds: messageReadIds },
      });
      const remaining = current.items.filter(m => !messageReadIds.includes(m.id));
      setMessages(remaining.length ? { ...current, items: remaining } : null);
      setMessageReadIds([]);
    } catch {
      toast.error("Melding bevestigen mislukt. Probeer opnieuw.");
    } finally { setAckBusy(false); }
  }

  useEffect(() => {
    let active = true;
    fetchPublicNotices({ data: { deviceToken: device.token } })
      .then((result) => { if (active && result.notices.length) setPublicNotices(result.notices); })
      .catch(() => { /* meldingen bij het openen mogen de app niet blokkeren */ });
    return () => { active = false; };
  }, [fetchPublicNotices]);

  useEffect(() => {
    let active = true;
    async function initializeDevice() {
      const device = await getOrRegisterDevice(initDevice);
      if (!active) return;
      setDeviceToken(device.token);
      setDeviceStatus(device.status);
    }
    void initializeDevice().catch(() => active && setDeviceStatus("blocked"));
    return () => { active = false; };
  }, [initDevice]);

  useEffect(() => {
    if (!deviceToken || deviceStatus === "approved" || deviceStatus === "blocked") return;
    const timer = window.setInterval(async () => {
      const result = await checkDevice({ data: { token: deviceToken } });
      setDeviceStatus(result.status as "pending" | "approved" | "blocked");
    }, 5000);
    return () => window.clearInterval(timer);
  }, [checkDevice, deviceStatus, deviceToken]);

  function addDigit(d: string) {
    if (pin.length >= 8) return;
    setPin((p) => p + d);
  }
  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  async function handleClock(direction: "in" | "out") {
    if (pin.length < 4) {
      toast.error("Voer minstens 4 cijfers in");
      return;
    }
    const usedPin = pin;
    setBusy(true);
    try {
      const res = direction === "in"
        ? await doClockIn({ data: { pin, deviceToken } })
        : await doClockOut({ data: { pin, deviceToken } });
      setStatus({ kind: "success", ...res });
      setHours(null);
      setPin("");
      toast.success(res.action === "in" ? `Ingetikt – ${res.name}` : `Uitgetikt – ${res.name}`);
      if (direction === "in") {
        try {
          const msg = await fetchMessages({ data: { pin: usedPin, deviceToken } });
          if (msg.messages.length > 0) { setMessageReadIds([]); setMessages({ pin: usedPin, name: msg.name, items: msg.messages }); }
        } catch {
          /* berichten ophalen mag het tikken niet blokkeren */
        }
      }
      if (direction === "in") {
        try {
          const pc = await fetchPendingContracts({ data: { pin: usedPin, deviceToken } });
          if (pc.contracts.length) { setPendingSignName(pc.name); setPendingSign({ pin: usedPin, name: pc.name, items: pc.contracts }); }
        } catch { /* onderaannemers of fouten blokkeren het tikken niet */ }
      }
      try {
        const result = await fetchCalendarNotices({ data: { pin: usedPin, deviceToken } });
        if (result.notices.length) { setCalendarReadKeys([]); setCalendarNotices({ pin: usedPin, items: result.notices }); }
      } catch { toast.error("Je bent geregistreerd, maar de kalendermeldingen konden niet worden geladen."); }
    } catch (e: any) {
      toast.error(e?.message ?? "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  async function handleViewHours() {
    if (pin.length < 4) {
      toast.error("Voer je PIN in");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchHours({ data: { pin, deviceToken } });
      setHours(res);
      setStatus({ kind: "idle" });
      setPin("");
    } catch (e: any) {
      toast.error(e?.message ?? "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  async function handleViewNotices() {
    if (pin.length < 4) return;
    setBusy(true);
    try {
      const result = await fetchCalendarNotices({ data: { pin, deviceToken } });
      setCalendarReadKeys([]);
      if (result.notices.length) setCalendarNotices({ pin, items: result.notices });
      else toast.success("Geen ongelezen kalendermeldingen vandaag");
      setPin("");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Meldingen ophalen mislukt"); }
    finally { setBusy(false); }
  }

  async function handleOpenRequest() {
    if (pin.length < 4) {
      toast.error("Voer je PIN in");
      return;
    }
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    setReqStart(`${today}T09:00`);
    setReqEnd(`${today}T17:00`);
    setReqNote("");
    setRequestOpen(true);
  }

  async function handleSubmitRequest() {
    if (!reqStart || !reqEnd) {
      toast.error("Vul start- en eindtijd in");
      return;
    }
    setBusy(true);
    try {
      const res = await submitRequest({
        data: {
          pin,
          deviceToken,
          clock_in: new Date(reqStart).toISOString(),
          clock_out: new Date(reqEnd).toISOString(),
          note: reqNote,
        },
      });
      toast.success(`Aanvraag verstuurd – ${res.name}. Wacht op goedkeuring.`);
      setRequestOpen(false);
      setPin("");
    } catch (e: any) {
      toast.error(e?.message ?? "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  async function handleViewRequests() {
    if (pin.length < 4) {
      toast.error("Voer je PIN in");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchRequests({ data: { pin, deviceToken } });
      setMyRequests(res);
      setHours(null);
      setMyPayslips(null);
      setStatus({ kind: "idle" });
      setPin("");
    } catch (e: any) {
      toast.error(e?.message ?? "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  async function handleViewPayslips() {
    if (pin.length < 4) {
      toast.error("Voer je PIN in");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchPayslips({ data: { pin, deviceToken } });
      setMyPayslips(res);
      setHours(null);
      setMyRequests(null);
      setStatus({ kind: "idle" });
      setPin("");
    } catch (e: any) {
      toast.error(e?.message ?? "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  async function loadHrFile(pinToUse: string) {
    const res = await fetchHrFile({ data: { pin: pinToUse, deviceToken } });
    setHrFile(res as HrFile);
    setSessionPin(pinToUse);
  }

  async function handleViewHrFile() {
    if (pin.length < 4) {
      toast.error("Voer je PIN in");
      return;
    }
    setBusy(true);
    try {
      await loadHrFile(pin);
      setHours(null);
      setMyRequests(null);
      setMyPayslips(null);
      setStatus({ kind: "idle" });
      setPin("");
    } catch (e: any) {
      toast.error(e?.message ?? "Er ging iets mis");
    } finally {
      setBusy(false);
    }
  }

  function handleViewOvertime() {
    if (pin.length < 4) {
      toast.error("Voer je PIN in");
      return;
    }
    setOvertimePin(pin);
    setHours(null);
    setMyRequests(null);
    setMyPayslips(null);
    setHrFile(null);
    setStatus({ kind: "idle" });
    setPin("");
  }



  return (
    <div className="min-h-screen bg-background flex flex-col">

      <Dialog open={!!publicNotices} onOpenChange={(open) => { if (!open) setPublicNotices(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{publicNotices?.some(n => n.birthday) ? "Een feestelijke dag!" : "Vandaag op de kalender"}</DialogTitle></DialogHeader>
          {publicNotices?.some(n => n.birthday) && <BirthdayFireworks />}
          <div className="space-y-4 max-h-[45vh] overflow-y-auto">{publicNotices?.map(n => <div key={n.key} className="border-b pb-3 last:border-0"><h3 className="text-xl break-words">{n.title}</h3><p className="text-sm whitespace-pre-wrap break-words mt-2">{n.body}</p></div>)}</div>
          <DialogFooter><Button onClick={() => setPublicNotices(null)}>Sluiten</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <header className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={rioryLogo.url} alt="Riory" className="h-10 w-auto" />
            <span className="heading-display text-2xl tracking-wide">
              Riory<span className="text-primary"> · Tikklok</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">
                <ShieldCheck className="h-4 w-4 mr-1" /> Admin
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {deviceStatus !== "approved" ? <main className="flex-1 grid place-items-center px-6 py-10">
        <Card className="max-w-lg p-8 text-center">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h2 className="heading-display text-3xl">{deviceStatus === "blocked" ? "Toestel geblokkeerd" : "Goedkeuring nodig"}</h2>
          <p className="mt-3 text-sm text-muted-foreground">{deviceStatus === "blocked" ? "Dit toestel heeft geen toegang tot de tikklok." : "Dit toestel wacht op goedkeuring door de beheerder. De pagina controleert dit automatisch."}</p>
          <Button asChild variant="outline" className="mt-6"><Link to="/auth">Naar admin</Link></Button>
        </Card>
      </main> : <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 grid md:grid-cols-2 gap-8">
        <Card className="p-6 flex flex-col border-border/60">
          <p className="eyebrow text-primary mb-2">Stempelklok</p>
          <h2 className="heading-display text-3xl mb-2">Voer je PIN in</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Tik je persoonlijke code om in of uit te tikken.
          </p>

          <div className="h-16 rounded-full border border-border bg-muted/40 flex items-center justify-center text-3xl tracking-[0.5em] font-mono mb-6">
            {pin.length === 0 ? (
              <span className="text-muted-foreground/40 text-base tracking-normal uppercase">
                PIN
              </span>
            ) : (
              "•".repeat(pin.length)
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Button
                key={d}
                variant="outline"
                className="h-14 text-xl"
                onClick={() => addDigit(d)}
                disabled={busy}
              >
                {d}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="h-14"
              onClick={() => setPin("")}
              disabled={busy || !pin}
            >
              C
            </Button>
            <Button
              variant="outline"
              className="h-14 text-xl"
              onClick={() => addDigit("0")}
              disabled={busy}
            >
              0
            </Button>
            <Button
              variant="ghost"
              className="h-14"
              onClick={backspace}
              disabled={busy || !pin}
            >
              <Delete className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="h-14"
              onClick={() => handleClock("in")}
              disabled={busy || pin.length < 4}
            >
              <LogIn className="h-4 w-4 mr-2" /> Tik in
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="h-14"
              onClick={() => handleClock("out")}
              disabled={busy || pin.length < 4}
            >
              <LogOut className="h-4 w-4 mr-2" /> Tik uit
            </Button>
          </div>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={handleViewHours}
            disabled={busy || pin.length < 4}
          >
            Mijn uren bekijken
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void handleViewNotices()} disabled={busy || pin.length < 4}>Mijn meldingen</Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleOpenRequest}
              disabled={busy || pin.length < 4}
            >
              <ClipboardList className="h-4 w-4 mr-2" /> Uren aanvragen
            </Button>
            <Button
              variant="ghost"
              onClick={handleViewRequests}
              disabled={busy || pin.length < 4}
            >
              Mijn aanvragen
            </Button>
          </div>
          <Button
            variant="ghost"
            className="mt-2 w-full"
            onClick={handleViewPayslips}
            disabled={busy || pin.length < 4}
          >
            Mijn loonstrook
          </Button>
          <Button
            variant="outline"
            className="mt-2 w-full"
            onClick={handleViewHrFile}
            disabled={busy || pin.length < 4}
          >
            <FileText className="h-4 w-4 mr-2" /> Mijn dossier & documenten
          </Button>
          <Button
            variant="outline"
            className="mt-2 w-full"
            onClick={handleViewOvertime}
            disabled={busy || pin.length < 4}
          >
            <CalendarDays className="h-4 w-4 mr-2" /> Overuren & vakantie
          </Button>
        </Card>

        <Dialog open={!!calendarNotices} onOpenChange={(open) => { if (!open && !ackBusy) { setCalendarNotices(null); setCalendarReadKeys([]); } }}>
          <DialogContent><DialogHeader><DialogTitle>{calendarNotices?.items.some(n => n.birthday) ? "Een feestelijke dag!" : "Vandaag op de kalender"}</DialogTitle></DialogHeader>
            {calendarNotices?.items.some(n => n.birthday) && <BirthdayFireworks />}
            <div className="space-y-4 max-h-[45vh] overflow-y-auto">{calendarNotices?.items.map(n => <div key={n.key} className="border-b pb-3 last:border-0"><h3 className="text-xl break-words">{n.title}</h3><p className="text-sm whitespace-pre-wrap break-words mt-2">{n.body}</p>{n.forAll && <p className="text-xs text-muted-foreground mt-2">Voor alle medewerkers</p>}<div className="flex items-center gap-2 mt-3"><Checkbox id={`read-${n.key}`} disabled={ackBusy} checked={calendarReadKeys.includes(n.key)} onCheckedChange={v => setCalendarReadKeys(keys => v === true ? [...keys, n.key] : keys.filter(k => k !== n.key))} /><Label htmlFor={`read-${n.key}`}>Gelezen</Label></div></div>)}</div>
            <DialogFooter><Button disabled={ackBusy || !calendarReadKeys.length} onClick={() => void confirmCalendarNotices()}>{ackBusy ? "Bevestigen…" : "Bevestigen"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!pendingSign && !calendarNotices && !messages} onOpenChange={(open) => { if (!open && !pendingSignBusy) setPendingSign(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Contract te ondertekenen – {pendingSign ? contractTypeLabel(pendingSign.items[0].contract_type) : ""}</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">De beheerder vraagt je dit contract te lezen en te ondertekenen.</p>
            <div className="whitespace-pre-wrap text-xs leading-relaxed border border-border/60 rounded-md p-4 max-h-[45vh] overflow-y-auto">{pendingSign?.items[0].body}</div>
            {pendingSign?.items[0]?.employer_signature_image && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Zaakvoerder: {pendingSign.items[0].employer_signed_name}</p>
                <img alt="Handtekening zaakvoerder" src={pendingSign.items[0].employer_signature_image} className="h-16 max-w-full rounded border border-border bg-signature-paper" />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="pending-sign-name">Je volledige naam</Label>
              <Input id="pending-sign-name" value={pendingSignName} onChange={(e) => setPendingSignName(e.target.value)} />
            </div>
            <SignaturePad key={pendingSign?.items[0]?.id} onChange={setPendingSignImage} />
            <DialogFooter>
              <Button variant="outline" disabled={pendingSignBusy} onClick={() => setPendingSign(null)}>Later</Button>
              <Button disabled={pendingSignBusy || !pendingSignImage} onClick={() => void signPendingContract()}>{pendingSignBusy ? "Ondertekenen…" : "Ondertekenen"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!messages && !calendarNotices} onOpenChange={(open) => { if (!open && !ackBusy) { setMessages(null); setMessageReadIds([]); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bericht van de beheerder{messages ? ` – ${messages.name}` : ""}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {(messages?.items ?? []).map((m) => (
                <div key={m.id} className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="font-semibold">{m.title}</p>
                  <p className="text-sm whitespace-pre-wrap mt-1">{m.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatDate(m.created_at)}{m.for_all ? " · voor alle medewerkers" : ""}
                  </p>
                  <div className="flex items-center gap-2 mt-3"><Checkbox id={`read-message-${m.id}`} disabled={ackBusy} checked={messageReadIds.includes(m.id)} onCheckedChange={v => setMessageReadIds(ids => v === true ? [...ids, m.id] : ids.filter(id => id !== m.id))} /><Label htmlFor={`read-message-${m.id}`}>Gelezen</Label></div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button disabled={ackBusy || !messageReadIds.length} onClick={() => void confirmMessages()}>{ackBusy ? "Bevestigen…" : "Bevestigen"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Uren aanvragen</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="req-start">Start</Label>
                <Input id="req-start" type="datetime-local" value={reqStart} onChange={(e) => setReqStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-end">Einde</Label>
                <Input id="req-end" type="datetime-local" value={reqEnd} onChange={(e) => setReqEnd(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-note">Toelichting (optioneel)</Label>
                <Textarea id="req-note" value={reqNote} maxLength={500} onChange={(e) => setReqNote(e.target.value)} placeholder="Bv. vergeten in te tikken" />
              </div>
              <p className="text-xs text-muted-foreground">De admin ontvangt je aanvraag en moet deze goedkeuren voor ze in je uren verschijnt.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRequestOpen(false)} disabled={busy}>Annuleren</Button>
              <Button onClick={handleSubmitRequest} disabled={busy}>Aanvraag versturen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-6">
          {status.kind === "success" && (
            <Card className="p-6">
              <div className="flex items-center gap-3">
                {status.action === "in" ? (
                  <LogIn className="h-6 w-6 text-primary" />
                ) : (
                  <LogOut className="h-6 w-6 text-primary" />
                )}
                <div>
                  <p className="text-sm text-muted-foreground">
                    {status.action === "in" ? "Ingetikt" : "Uitgetikt"}
                  </p>
                  <p className="text-xl font-semibold">{status.name}</p>
                </div>
              </div>
              <p className="mt-4 text-3xl font-mono">{formatTime(status.time)}</p>
              {status.action === "out" && status.clockIn && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Sessie: {formatTime(status.clockIn)} – {formatTime(status.time)} (
                  {formatDuration(
                    Math.round(
                      (new Date(status.time).getTime() -
                        new Date(status.clockIn).getTime()) /
                        60000,
                    ),
                  )}
                  )
                </p>
              )}
            </Card>
          )}

          {hours && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold">Uren – {hours.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">Laatste 30 dagen</p>
              {hours.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen tikken geregistreerd.</p>
              ) : (
                <ul className="divide-y">
                  {hours.entries.map((e) => {
                    const mins =
                      e.clock_out != null
                        ? Math.round(
                            (new Date(e.clock_out).getTime() -
                              new Date(e.clock_in).getTime()) /
                              60000,
                          )
                        : null;
                    return (
                      <li key={e.id} className="py-2 flex items-center justify-between text-sm">
                        <span className="font-medium">{formatDate(e.clock_in)}</span>
                        <span className="text-muted-foreground">
                          {formatTime(e.clock_in)} –{" "}
                          {e.clock_out ? formatTime(e.clock_out) : "bezig"}
                        </span>
                        <span className="font-mono">
                          {mins != null ? formatDuration(mins) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {myRequests && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Aanvragen – {myRequests.name}</h3>
                <Button variant="ghost" size="sm" onClick={() => setMyRequests(null)}>Sluiten</Button>
              </div>
              {myRequests.requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen aanvragen ingediend.</p>
              ) : (
                <ul className="divide-y">
                  {myRequests.requests.map((r) => {
                    const badge = r.status === "approved" ? "text-green-600" : r.status === "rejected" ? "text-destructive" : "text-muted-foreground";
                    const label = r.status === "approved" ? "Goedgekeurd" : r.status === "rejected" ? "Afgewezen" : "In behandeling";
                    return (
                      <li key={r.id} className="py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{formatDate(r.clock_in)}</span>
                          <span className={`text-xs uppercase ${badge}`}>{label}</span>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatTime(r.clock_in)} – {formatTime(r.clock_out)}
                        </div>
                        {r.note && <div className="text-xs mt-1">"{r.note}"</div>}
                        {r.review_note && <div className="text-xs mt-1 italic">Reactie: {r.review_note}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {myPayslips && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Loonstroken – {myPayslips.name}</h3>
                <Button variant="ghost" size="sm" onClick={() => setMyPayslips(null)}>Sluiten</Button>
              </div>
              {myPayslips.payslips.length === 0 ? (
                <p className="text-sm text-muted-foreground">Er is nog geen loonberekening beschikbaar. Vraag je werkgever om de maand te berekenen.</p>
              ) : (
                <ul className="divide-y">
                  {myPayslips.payslips.map((p) => (
                    <li key={p.period_month} className="py-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{new Date(p.period_month).toLocaleDateString("nl-BE", { month: "long", year: "numeric" })}</span>
                        <span className="font-mono font-semibold">{new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(p.payable)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1 text-xs text-muted-foreground">
                        <span>Bruto: {new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(p.gross)}</span>
                        <span>RSZ: {new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(p.rsz_employee)}</span>
                        <span>BV: {new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(p.bv)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Uren: {(p.worked_minutes / 60).toFixed(2)} · Opgespaard: {(p.banked_overtime_minutes / 60).toFixed(2)} u aan 150% · Voorschotten: {new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(p.advances)}</div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground mt-3 italic">{myPayslips.disclaimer}</p>
            </Card>
          )}

          {hrFile && (
            <MyHrFile
              data={hrFile}
              pin={sessionPin}
              deviceToken={deviceToken}
              onClose={() => { setHrFile(null); setSessionPin(""); }}
              onRefresh={() => { void loadHrFile(sessionPin).catch(() => toast.error("Vernieuwen mislukt")); }}
            />
          )}

          {overtimePin && (
            <MyOvertime
              pin={overtimePin}
              deviceToken={deviceToken}
              onClose={() => setOvertimePin("")}
            />
          )}

          {status.kind === "idle" && !hours && !myRequests && !myPayslips && !hrFile && !overtimePin && (
            <Card className="p-6 bg-muted/30">
              <h3 className="font-semibold mb-2">Welkom</h3>
              <p className="text-sm text-muted-foreground">
                Voer je PIN in op het toetsenblok om in of uit te tikken, je uren te bekijken,
                of vergeten uren aan te vragen.
              </p>
            </Card>
          )}
        </div>
      </main>}
    </div>
  );
}
