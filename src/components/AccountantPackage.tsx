import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { checkAccountantPackage, sendAccountantPackage } from "@/lib/accountant-package.functions";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const yearStart = (y: number) => `${y}-01-01`;
const yearEnd = (y: number) => `${y}-12-31`;
const monthStartAgo = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return iso(d); };
const nl = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

type Chk = { from: string; to: string; onlyNew: boolean; sales: number; purchases: number; alreadySent: number; warnings: string[] };

/** Two mails to the accountant for one chosen period: UBL documents + Excel comparison pack. */
export function AccountantPackage({ accountantEmail }: { accountantEmail: string | null }) {
  const year = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(yearStart(year));
  const [to, setTo] = useState(yearEnd(year));
  const [onlyNew, setOnlyNew] = useState(true);
  const [chk, setChk] = useState<Chk | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const check = useServerFn(checkAccountantPackage);
  const sendPack = useServerFn(sendAccountantPackage);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setChecking(true);
    check({ data: { from, to, onlyNew } })
      .then((r) => { if (alive) setChk(r); })
      .catch((e) => { if (alive) { setChk(null); toast.error(e instanceof Error ? e.message : "Controleren mislukt"); } })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [open, from, to, onlyNew, check]);

  const stale = !chk || chk.from !== from || chk.to !== to || chk.onlyNew !== onlyNew;

  async function send() {
    if (stale) return;
    setBusy(true);
    try {
      const r = await sendPack({ data: { from, to, onlyNew } });
      if (r.warnings.length) toast.warning(`2 mails verzonden naar ${r.to}, maar de boekhouding is niet volledig (${r.warnings.length} punten).`);
      else toast.success(`2 mails verzonden naar ${r.to} (${r.ubl} UBL-bestanden + boekhoudpakket).`);
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verzenden mislukt"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Alles naar boekhouder</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alles naar de boekhouder</DialogTitle>
          <DialogDescription>Twee mails naar {accountantEmail || "het e-mailadres van de boekhouder"}: één met alle aankoop- en verkoopdocumenten in UBL, één met balans, afschrijvingstabellen en alle stukken uit de boekhouding (Excel).</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs"><span className="font-semibold">Van</span><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="space-y-1 text-xs"><span className="font-semibold">Tot</span><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" onClick={() => { setFrom(yearStart(year)); setTo(yearEnd(year)); }}>Boekjaar {year}</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(yearStart(year - 1)); setTo(yearEnd(year - 1)); }}>Boekjaar {year - 1}</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(monthStartAgo(2)); setTo(today()); }}>Laatste 3 maanden</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(monthStartAgo(11)); setTo(today()); }}>Laatste 12 maanden</Button>
        </div>
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-semibold">{nl(from)} tot {nl(to)}</p>
          {checking && <p className="text-muted-foreground">Controleren…</p>}
          {!checking && chk && <p>{chk.sales} verkoop- en {chk.purchases} aankoopdocumenten in deze periode.</p>}
          {!checking && !chk && <p className="text-destructive">Deze periode kon niet gecontroleerd worden. Pas de data aan.</p>}
          {!checking && chk && (chk.warnings.length ? (
            <div className="space-y-1">
              <p className="font-bold text-destructive">De boekhouding is nog niet volledig:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">{chk.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          ) : <p className="font-semibold text-primary">De boekhouding van deze periode is volledig.</p>)}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Sluiten</Button>
          <Button size="sm" disabled={busy || checking || stale || !accountantEmail} onClick={send}>Versturen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
