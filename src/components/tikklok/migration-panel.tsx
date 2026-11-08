import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock, ExternalLink, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { checkTikklokMailbox, getTikklokMigrationStatus, testMigratedPin } from '@/lib/tikklok/migration.functions';

export function MigrationPanel({ employees }: { employees: { id: string; name: string }[] }) {
  const statusFn = useServerFn(getTikklokMigrationStatus);
  const pinFn = useServerFn(testMigratedPin);
  const mailboxFn = useServerFn(checkTikklokMailbox);
  const status = useQuery({ queryKey: ['tikklok:migration'], queryFn: () => statusFn({}) });
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [pinResult, setPinResult] = useState('');
  const [mailResult, setMailResult] = useState('');
  const [busy, setBusy] = useState(false);
  async function checkPin() {
    setBusy(true); setPinResult('');
    try { const result = await pinFn({ data: { employeeId, pin } }); setPinResult(result.matches ? 'Pincode klopt. Er is geen klokregistratie gemaakt.' : 'Pincode komt niet overeen. De bestaande pincode is niet gewijzigd.'); }
    catch (e) { setPinResult(e instanceof Error ? e.message : 'Controle mislukt'); }
    finally { setPin(''); setBusy(false); }
  }
  async function checkMail() {
    setBusy(true);
    try { const result = await mailboxFn({}); setMailResult(result.correctSender ? `Afzender bevestigd: ${result.mailbox}. Er is geen mail verstuurd.` : `Gekoppeld: ${result.mailbox ?? 'onbekend'}. Voor tikklokmails is info@riory.be nodig.`); }
    catch (e) { setMailResult(e instanceof Error ? e.message : 'Controle mislukt'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-8">
    <section className="border-b pb-6">
      <h2 className="text-xl font-bold">Tikklokoverdracht</h2>
      <p className="mt-2 text-sm text-muted-foreground">De oude tikklok blijft actief. Export van 8 november 2026: 369 regels overgenomen en vergeleken.</p>
      <Button asChild variant="outline" className="mt-4"><a href="https://tikklokriory.lovable.app/admin" target="_blank" rel="noopener noreferrer"><ExternalLink /> Oude tikklok</a></Button>
    </section>
    <section>
      <h3 className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" /> Overgenomen gegevens</h3>
      {status.isPending && <p className="mt-3 text-sm">Controleren…</p>}
      {status.error && <p role="alert" className="mt-3 text-sm text-destructive">{status.error.message}</p>}
      <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">{status.data?.counts.map(row => <div key={row.label} className="flex justify-between border-b py-2 text-sm"><dt>{row.label}</dt><dd className="font-mono">{row.count} <span className="text-muted-foreground">/ {row.expected} in export</span></dd></div>)}</dl>
      <p className="mt-3 text-sm">Contracten met beide handtekeningen: {status.data?.signed ?? '…'}</p>
    </section>
    <section className="border-t pt-6">
      <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Bestaande pincode controleren</h3>
      <div className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2"><Label>Medewerker</Label><Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger aria-label="Medewerker voor pincodecontrole"><SelectValue placeholder="Kies medewerker" /></SelectTrigger><SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="migration-pin">Bestaande pincode</Label><Input id="migration-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={e => setPin(e.target.value)} className="sm:w-40" /></div>
        <Button disabled={busy || !employeeId || pin.length < 4} onClick={checkPin}><ShieldCheck /> Controleren</Button>
      </div>
      {pinResult && <p role="status" className="mt-3 text-sm">{pinResult}</p>}
    </section>
    <section className="border-t pt-6">
      <h3 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Mailafzender en planning</h3>
      <Button variant="outline" className="mt-4" disabled={busy} onClick={checkMail}><Mail /> Afzender controleren</Button>
      {mailResult && <p role="status" className="mt-3 text-sm">{mailResult}</p>}
      <p className="mt-3 text-sm">Automatische mails: {status.data?.jobsEnabled ? 'ingeschakeld' : 'uitgeschakeld tijdens de overdracht'}.</p>
      <p className="mt-2 text-sm text-muted-foreground">Verjaardagsmails: bronplanning dagelijks 06:30 UTC. Maandrapporten: eerste dag van de maand; oorspronkelijke planning nog te bevestigen.</p>
    </section>
    <section className="border-t pt-6">
      <h3 className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4" /> Nog nodig vóór omschakeling</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
        <li>Bestandsinventaris en eventuele privébestanden uit de oude tikklok.</li>
        <li>Bronbeheerders met oorspronkelijk gebruikersnummer en e-mailadres.</li>
        <li>Sociaal secretariaat controleren bij Contracten → Firmagegevens.</li>
        <li>Werkende bestaande pincode en mailafzender controleren.</li>
        <li>Laatste export na de laatste registraties in de oude tikklok.</li>
        <li>Jouw expliciete goedkeuring voor omschakeling en automatische mails.</li>
      </ul>
    </section>
  </div>;
}